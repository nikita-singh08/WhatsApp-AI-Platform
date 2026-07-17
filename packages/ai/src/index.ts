
export interface LLMMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: any;
}

export interface ChatCompletionResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  toolCalls?: Array<{
    name: string;
    args: any;
  }>;
}

export interface EmbeddingResult {
  values: number[];
}

export interface LLMProvider {
  generateChatCompletion(params: {
    model?: string;
    systemInstruction?: string;
    messages: LLMMessage[];
    tools?: LLMToolDefinition[];
    temperature?: number;
  }): Promise<ChatCompletionResult>;

  generateEmbedding(params: {
    model?: string;
    text: string;
  }): Promise<EmbeddingResult>;
}

/**
 * Gemini-backed implementation of the LLMProvider interface
 */
export class GeminiProvider implements LLMProvider {
  private getApiKey(): string {
    return process.env.GEMINI_API_KEY || 'dummy_gemini_key';
  }

  async generateChatCompletion(params: {
    model?: string;
    systemInstruction?: string;
    messages: LLMMessage[];
    tools?: LLMToolDefinition[];
    temperature?: number;
  }): Promise<ChatCompletionResult> {
    const apiKey = this.getApiKey();
    const modelName = params.model || 'gemini-1.5-flash';

    console.log(`[GeminiProvider] Calling Chat Completion with model: ${modelName}`);

    // If using a dummy key, return mock text response
    if (apiKey === 'dummy_gemini_key') {
      console.log('[GeminiProvider] Running in dummy/mock mode (no active GEMINI_API_KEY)');
      return {
        text: 'This is a mock AI response from the Gemini stub. Configure GEMINI_API_KEY in .env to receive actual responses.',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      };
    }

    try {
      // Lazy load standard package imports
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const contents = params.messages.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: params.systemInstruction,
      });

      const response = await model.generateContent({
        contents,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
        },
      });

      const text = response.response.text() || '';
      
      // Basic token estimations for pricing logs (Gemini standard SDK does not return exact tokens in every call)
      const promptTokens = Math.ceil(contents.reduce((acc, c) => acc + c.parts[0].text.length / 4, 0));
      const completionTokens = Math.ceil(text.length / 4);

      return {
        text,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    } catch (error: any) {
      console.error('[GeminiProvider Error]', error);
      throw new Error(`Gemini generateChatCompletion failed: ${error.message}`);
    }
  }

  async generateEmbedding(params: {
    model?: string;
    text: string;
  }): Promise<EmbeddingResult> {
    const apiKey = this.getApiKey();
    const modelName = params.model || 'text-embedding-004';

    console.log(`[GeminiProvider] Calling generateEmbedding with model: ${modelName}`);

    if (apiKey === 'dummy_gemini_key') {
      // Return 768-dimension zero vector for local development
      return {
        values: new Array(768).fill(0),
      };
    }

    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const result = await model.embedContent(params.text);
      return {
        values: result.embedding.values,
      };
    } catch (error: any) {
      console.error('[GeminiProvider Embedding Error]', error);
      throw new Error(`Gemini generateEmbedding failed: ${error.message}`);
    }
  }
}
