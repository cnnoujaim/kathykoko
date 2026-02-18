import { Request, Response } from 'express';
import { categoryRepository } from '../repositories/category.repository';

class CategoryController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const categories = await categoryRepository.listByUser(userId);
      res.json({ categories });
    } catch (error) {
      console.error('Category list error:', error);
      res.status(500).json({ error: 'Failed to list categories' });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { name, color } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Category name is required' });
        return;
      }

      const category = await categoryRepository.create(userId, name.trim(), color);
      res.json({ category });
    } catch (error: any) {
      if (error.constraint === 'categories_user_id_name_key') {
        res.status(409).json({ error: 'Category already exists' });
        return;
      }
      console.error('Category create error:', error);
      res.status(500).json({ error: 'Failed to create category' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { name, color } = req.body;

      const category = await categoryRepository.update(id, userId, name, color);
      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      res.json({ category });
    } catch (error) {
      console.error('Category update error:', error);
      res.status(500).json({ error: 'Failed to update category' });
    }
  }

  async remove(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const deleted = await categoryRepository.delete(id, userId);
      if (!deleted) {
        res.status(400).json({ error: 'Cannot delete default category or category not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Category delete error:', error);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  }
}

export const categoryController = new CategoryController();
