import { config } from '../../config';

/**
 * Embeddings Service
 *
 * Note: Claude doesn't have a native embeddings API yet.
 * For production, use OpenAI's text-embedding-3-small API.
 *
 * To enable:
 * 1. Add OPENAI_API_KEY to your .env
 * 2. npm install openai
 * 3. Uncomment the OpenAI implementation below
 */

export class EmbeddingsService {
  private dimension: number = 1536; // OpenAI text-embedding-3-small dimension

  /**
   * Generate embedding for text
   *
   * IMPORTANT: This is a placeholder implementation.
   * For production, integrate with OpenAI or another embedding service.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Option 1: Use OpenAI (RECOMMENDED FOR PRODUCTION)
    // Uncomment this when you add OPENAI_API_KEY to .env
    /*
    try {
      const OpenAI = require('openai').default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('OpenAI embedding error:', error);
      return this.generateSimpleEmbedding(text);
    }
    */

    // Option 2: Simple hash-based embedding (FOR MVP ONLY)
    return this.generateSimpleEmbedding(text);
  }

  /**
   * Simple embedding based on text hash (FOR MVP ONLY)
   *
   * This creates a pseudo-embedding that can work for basic similarity
   * but won't be as accurate as real embeddings.
   */
  private generateSimpleEmbedding(text: string): number[] {
    const normalized = text.toLowerCase();
    const embedding = new Array(this.dimension).fill(0);

    // Generate features based on keywords
    const keywords = {
      // Persephone / Music
      persephone: ['album', 'recording', 'mixing', 'studio', 'song', 'music', 'vocals', 'perform', 'show', 'gig', 'spotify', 'listeners'],
      // Lyra / Work
      lyra: ['work', 'meeting', 'lyra', 'project', 'code', 'tech', 'architecture', 'design', 'review', 'sprint'],
      // Bloom / Health
      bloom: ['health', 'workout', 'cardio', 'strength', 'edible', 'sleep', 'food', 'meal', 'nutrition', 'stairs'],
      // Sanctuary / Home
      sanctuary: ['home', 'house', 'guest room', 'renovation', 'contractor', 'hosting', 'party', 'dinner', 'travel', 'finance'],
    };

    // Score by category
    let categoryScores = { persephone: 0, lyra: 0, bloom: 0, sanctuary: 0 };

    Object.entries(keywords).forEach(([category, words]) => {
      words.forEach(word => {
        if (normalized.includes(word)) {
          categoryScores[category as keyof typeof categoryScores]++;
        }
      });
    });

    // Encode category scores into embedding dimensions
    embedding[0] = categoryScores.persephone;
    embedding[1] = categoryScores.lyra;
    embedding[2] = categoryScores.bloom;
    embedding[3] = categoryScores.sanctuary;

    // Add text length as a feature
    embedding[4] = text.length / 100;

    // Normalize to prevent extreme values
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / magnitude;
      }
    }

    return embedding;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const embeddingsService = new EmbeddingsService();
