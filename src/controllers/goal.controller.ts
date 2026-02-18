import { Request, Response } from 'express';
import { goalRepository } from '../repositories/goal.repository';
import { goalMilestoneRepository } from '../repositories/goal-milestone.repository';
import { embeddingsService } from '../services/ai/embeddings.service';
import { claudeService } from '../services/ai/claude.service';
import { pool } from '../config/database';

class GoalController {
  /**
   * GET /api/goals — List user's goals with milestones and progress
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const goals = await goalRepository.findAll(userId);

      if (goals.length === 0) {
        res.json({ goals: [], hasGoals: false });
        return;
      }

      const goalIds = goals.map(g => g.id);
      const allMilestones = await goalMilestoneRepository.listByGoals(goalIds);

      // Get aligned completed task counts per category
      const taskCounts = await pool.query(
        `SELECT category, COUNT(*) as count
         FROM tasks
         WHERE user_id = $1 AND status = 'completed' AND alignment_score > 0.5
         GROUP BY category`,
        [userId]
      );
      const taskCountMap: Record<string, number> = {};
      taskCounts.rows.forEach((r: { category: string; count: string }) => {
        taskCountMap[r.category] = parseInt(r.count);
      });

      const goalsWithProgress = goals.map(goal => {
        const milestones = allMilestones.filter(m => m.goal_id === goal.id);
        const completedMilestones = milestones.filter(m => m.is_completed).length;
        const totalMilestones = milestones.length;
        const milestoneProgress = totalMilestones > 0 ? completedMilestones / totalMilestones : 0;
        const alignedTasks = taskCountMap[goal.category] || 0;

        return {
          ...goal,
          milestones,
          progress: {
            completedMilestones,
            totalMilestones,
            milestoneProgress: Math.round(milestoneProgress * 100),
            alignedTasksCompleted: alignedTasks,
          },
        };
      });

      res.json({ goals: goalsWithProgress, hasGoals: true });
    } catch (error) {
      console.error('List goals error:', error);
      res.status(500).json({ error: 'Failed to load goals' });
    }
  }

  /**
   * POST /api/goals — Create a goal with optional milestones
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { title, description, category, priority, target_date, success_criteria, milestones } = req.body;

      if (!title || !category) {
        res.status(400).json({ error: 'Title and category are required' });
        return;
      }

      // Generate embedding
      const embedding = await embeddingsService.generateEmbedding(`${title}. ${description || ''}`);

      const goal = await goalRepository.create({
        title,
        description: description || '',
        category,
        priority: priority || 1,
        target_date: target_date ? new Date(target_date) : undefined,
        success_criteria,
        embedding,
        user_id: userId,
      });

      // Create milestones if provided
      if (milestones && Array.isArray(milestones)) {
        for (let i = 0; i < milestones.length; i++) {
          await goalMilestoneRepository.create(goal.id, milestones[i], i);
        }
      }

      res.json({ goal });
    } catch (error) {
      console.error('Create goal error:', error);
      res.status(500).json({ error: 'Failed to create goal' });
    }
  }

  /**
   * PUT /api/goals/:id — Update a goal
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { title, description, category, priority, target_date, success_criteria } = req.body;

      const goal = await goalRepository.update(id, {
        title, description, category, priority,
        target_date: target_date ? new Date(target_date) : undefined,
        success_criteria,
      }, userId);

      if (!goal) {
        res.status(404).json({ error: 'Goal not found' });
        return;
      }

      // Regenerate embedding if title/description changed
      if (title || description) {
        const embedding = await embeddingsService.generateEmbedding(`${goal.title}. ${goal.description || ''}`);
        await goalRepository.updateEmbedding(goal.id, embedding);
      }

      res.json({ goal });
    } catch (error) {
      console.error('Update goal error:', error);
      res.status(500).json({ error: 'Failed to update goal' });
    }
  }

  /**
   * DELETE /api/goals/:id
   */
  async remove(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const deleted = await goalRepository.delete(req.params.id, userId);
      if (!deleted) {
        res.status(404).json({ error: 'Goal not found' });
        return;
      }
      res.json({ message: 'Goal deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete goal' });
    }
  }

  /**
   * POST /api/goals/:id/milestones — Add a milestone
   */
  async addMilestone(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const goal = await goalRepository.findById(req.params.id, userId);
      if (!goal) {
        res.status(404).json({ error: 'Goal not found' });
        return;
      }

      const { title } = req.body;
      if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      const existing = await goalMilestoneRepository.listByGoal(goal.id);
      const milestone = await goalMilestoneRepository.create(goal.id, title, existing.length);
      res.json({ milestone });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add milestone' });
    }
  }

  /**
   * PATCH /api/goals/milestones/:id/toggle
   */
  async toggleMilestone(req: Request, res: Response): Promise<void> {
    try {
      const milestone = await goalMilestoneRepository.toggleComplete(req.params.id);
      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }
      res.json({ milestone });
    } catch (error) {
      res.status(500).json({ error: 'Failed to toggle milestone' });
    }
  }

  /**
   * POST /api/goals/generate — AI generates goals from user description
   */
  async generate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { category, input } = req.body;

      if (!category || !input) {
        res.status(400).json({ error: 'Category and input are required' });
        return;
      }

      const result = await claudeService.completeJSON<{
        goals: Array<{
          title: string;
          description: string;
          success_criteria: string;
          target_date: string;
          priority: number;
          milestones: string[];
        }>;
      }>(
        `The user wants to set goals for their "${category}" area of life. Based on their input, generate 1-3 SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound).

User's input: "${input}"

For each goal, provide:
- A clear, specific title
- A description explaining the goal
- Measurable success criteria (how will they know they achieved it?)
- A target date (YYYY-MM-DD format, within the next 12 months)
- Priority (1=highest, 3=lowest)
- 2-4 concrete milestones that lead to the goal

Return JSON:
{
  "goals": [
    {
      "title": "...",
      "description": "...",
      "success_criteria": "...",
      "target_date": "YYYY-MM-DD",
      "priority": 1,
      "milestones": ["milestone 1", "milestone 2", "milestone 3"]
    }
  ]
}`,
        'You are Kathy Koko, an AI Chief of Staff. Generate ambitious but achievable goals with measurable outcomes. Focus on results, not activities.',
        1024
      );

      // Save each generated goal
      const savedGoals = [];
      for (const g of result.goals) {
        const embedding = await embeddingsService.generateEmbedding(`${g.title}. ${g.description}`);
        const goal = await goalRepository.create({
          title: g.title,
          description: g.description,
          category,
          priority: g.priority,
          target_date: new Date(g.target_date),
          success_criteria: g.success_criteria,
          embedding,
          user_id: userId,
        });

        for (let i = 0; i < g.milestones.length; i++) {
          await goalMilestoneRepository.create(goal.id, g.milestones[i], i);
        }

        savedGoals.push({ ...goal, milestones: g.milestones });
      }

      res.json({ goals: savedGoals });
    } catch (error) {
      console.error('Generate goals error:', error);
      res.status(500).json({ error: 'Failed to generate goals' });
    }
  }
}

export const goalController = new GoalController();
