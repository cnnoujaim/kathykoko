import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }

  /**
   * Complete a prompt using Claude
   */
  async complete(
    prompt: string,
    systemPrompt?: string,
    maxTokens: number = 1024
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: config.anthropic.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      return textContent.text;
    } catch (error) {
      console.error('Claude API error:', error);
      throw error;
    }
  }

  /**
   * Complete with JSON response (for structured outputs)
   */
  async completeJSON<T>(
    prompt: string,
    systemPrompt?: string,
    maxTokens: number = 1024
  ): Promise<T> {
    const response = await this.complete(prompt, systemPrompt, maxTokens);

    try {
      // Extract JSON from response (handles cases where Claude adds markdown)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/{[\s\S]*}/);
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      return JSON.parse(jsonString) as T;
    } catch (error) {
      console.error('Failed to parse JSON from Claude:', response);
      throw new Error('Claude response was not valid JSON');
    }
  }

  /**
   * Generate embeddings for semantic search
   * Note: Claude doesn't have a native embedding API yet
   * For MVP, we'll use a simple hash-based approach or integrate with another service
   * TODO: Integrate with a proper embedding service (e.g., together.ai, OpenAI)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Placeholder for MVP - will integrate proper embedding service in Sprint 2
    console.warn('generateEmbedding is using placeholder implementation');

    // For now, return a zero vector (1536 dimensions for compatibility)
    // In Sprint 2, we'll integrate a proper embedding service
    return new Array(1536).fill(0);
  }
}

export const claudeService = new ClaudeService();
