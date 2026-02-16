import { pool } from '../src/config/database';
import { goalRepository } from '../src/repositories/goal.repository';
import { embeddingsService } from '../src/services/ai/embeddings.service';

const goals2026 = [
  // Pillar 1: Career & Creativity (The Artist) - Category: persephone
  {
    category: 'persephone' as const,
    title: 'Complete Persephone album recording and mixing',
    description: 'Complete 100% of the recording, tracking, and final mixing for the Persephone album by December 15, 2026, ensuring it is ready for mastering and the April 2027 release.',
    priority: 1,
    target_date: new Date('2026-12-15'),
    success_criteria: 'Album 100% recorded, tracked, and mixed. Ready for mastering.',
  },
  {
    category: 'persephone' as const,
    title: 'Build performance stamina for 60-minute sets',
    description: 'By October 1, 2026, be physically capable of performing a 60-minute set that includes continuous singing and choreography without being winded. Benchmark: Run 3 flights of stairs 3 times in a row by March 1, 2026.',
    priority: 2,
    target_date: new Date('2026-10-01'),
    success_criteria: 'Can perform 60-min set with singing and choreography without being winded. Benchmark: 3 flights of stairs x3 without stopping by March 1.',
  },
  {
    category: 'persephone' as const,
    title: 'Reach 10,000 monthly Spotify listeners',
    description: 'Reach 10,000 Monthly Listeners on Spotify by December 31, 2026 through organic content strategy. Post 3 short-form videos per week (Reels/TikTok) featuring behind-the-scenes or covers. Use $500-$1k/month Meta/TikTok ads.',
    priority: 2,
    target_date: new Date('2026-12-31'),
    success_criteria: '10,000 monthly Spotify listeners. 3 short-form videos/week. $500-1k/month ad budget.',
  },
  {
    category: 'persephone' as const,
    title: 'Perform 12 Sofar Sounds shows in 2026',
    description: 'Book and perform 12 Sofar Sounds shows in 2026 (approx. 1 every month starting in January).',
    priority: 2,
    target_date: new Date('2026-12-31'),
    success_criteria: '12 Sofar Sounds shows completed (1 per month).',
  },
  {
    category: 'persephone' as const,
    title: 'Book and sell out a headline show',
    description: 'Book and sell out one HEADLINE show at a local venue (e.g., Hotel Utah, Bottom of the Hill) by Q4 2026. Not a Sofar shared bill—your name on the ticket.',
    priority: 1,
    target_date: new Date('2026-12-31'),
    success_criteria: 'One sold-out headline show at a local venue.',
  },
  {
    category: 'persephone' as const,
    title: 'Host quarterly industry/creative mixers',
    description: 'Host a quarterly industry/creative mixer. Invite musicians, producers, and photographers to your space. Make your home a hub for the scene.',
    priority: 3,
    target_date: new Date('2026-12-31'),
    success_criteria: '4 quarterly creative mixers hosted (March, June, Sept, Dec).',
  },
  {
    category: 'persephone' as const,
    title: 'Release 6 singles in 2026 (Waterfall Strategy)',
    description: 'Release 6 Singles in 2026 as a "Waterfall Strategy" to build hype for the 2027 album.',
    priority: 1,
    target_date: new Date('2026-12-31'),
    success_criteria: '6 singles released throughout 2026.',
  },

  // Pillar 2: Health & Wellness (The Vessel) - Category: bloom
  {
    category: 'bloom' as const,
    title: 'Eliminate weeknight restaurant takeout',
    description: 'Eliminate reliance on restaurant takeout/delivery for weeknight dinners by April 1, 2026. Hire a personal chef/meal service (like The Cupboard SF, Shef) to provide 4-5 days of meals per week.',
    priority: 2,
    target_date: new Date('2026-04-01'),
    success_criteria: 'Personal chef/meal service providing 4-5 days of meals. Zero restaurant takeout on weeknights.',
  },
  {
    category: 'bloom' as const,
    title: 'Reduce edible consumption to 0mg on weeknights',
    description: 'Reduce average edible consumption from ~5mg/daily to 0mg on weeknights (saving usage for weekends/occasions only) by March 1, 2026, to improve sleep quality and vocal health.',
    priority: 1,
    target_date: new Date('2026-03-01'),
    success_criteria: '0mg edibles on weeknights. Weekend/occasion use only.',
  },
  {
    category: 'bloom' as const,
    title: 'Establish performer training routine',
    description: 'Establish a consistent "performer training" routine consisting of 3 cardio/dance sessions and 2 strength sessions per week by February 2026.',
    priority: 2,
    target_date: new Date('2026-02-28'),
    success_criteria: '3 cardio/dance + 2 strength sessions per week, consistently.',
  },

  // Pillar 3: Environment & Finance (The Sanctuary) - Category: sanctuary
  {
    category: 'sanctuary' as const,
    title: 'Complete Guest Room and Home Studio by July 1',
    description: 'Complete all "settling in" renovation projects—specifically the Guest Room setup and Home Studio sound treatment—by July 1, 2026.',
    priority: 1,
    target_date: new Date('2026-07-01'),
    success_criteria: 'Guest Room 100% set up. Home Studio sound treatment completed.',
  },
  {
    category: 'lyra' as const,
    title: 'Maintain Meets/Exceeds rating while capping at 40 hours/week',
    description: 'Maintain a "Meets/Exceeds Expectations" rating at MLE role throughout 2026 while strictly capping working hours to 40 hours/week to preserve creative energy.',
    priority: 1,
    target_date: new Date('2026-12-31'),
    success_criteria: 'Meets/Exceeds rating. Never exceed 40 hours/week.',
  },
  {
    category: 'sanctuary' as const,
    title: 'Automate finances and reinstate stock contributions',
    description: 'Automate 100% of mortgage and tax payments, and reinstate automatic stock portfolio contributions (min. $500/month) by April 2026.',
    priority: 2,
    target_date: new Date('2026-04-30'),
    success_criteria: 'Mortgage/tax auto-payments set up. $500/month stock contributions automated.',
  },

  // Pillar 4: Relationships & Fun (The Hostess) - Category: sanctuary
  {
    category: 'sanctuary' as const,
    title: 'Limit personal travel to 2 trips max',
    description: 'Limit personal travel to a maximum of 2 trips in 2026 to prioritize grounding and home enjoyment.',
    priority: 3,
    target_date: new Date('2026-12-31'),
    success_criteria: 'No more than 2 personal trips in 2026.',
  },
  {
    category: 'sanctuary' as const,
    title: 'Host monthly social gatherings',
    description: 'Host one social gathering per month at the house starting February 2026 (e.g., dinner parties, game nights, or listening sessions).',
    priority: 2,
    target_date: new Date('2026-12-31'),
    success_criteria: 'One social gathering per month (Feb-Dec = 11 total).',
  },
];

async function seedGoals() {
  try {
    console.log('🌱 Seeding 2026 Cultivation Goals...\n');

    // Clear existing goals
    console.log('Clearing existing goals...');
    await goalRepository.deleteAll();

    // Seed each goal with embeddings
    for (const goalData of goals2026) {
      console.log(`→ Creating: ${goalData.title}`);

      // Generate embedding for the goal
      const textToEmbed = `${goalData.title}. ${goalData.description}`;
      const embedding = await embeddingsService.generateEmbedding(textToEmbed);

      // Create goal with embedding
      await goalRepository.create({
        ...goalData,
        embedding,
      });

      console.log(`  ✓ Embedded (${embedding.length} dimensions)`);
    }

    console.log(`\n✅ Successfully seeded ${goals2026.length} goals!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed goals:', error);
    process.exit(1);
  }
}

seedGoals();
