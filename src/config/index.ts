import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  database: {
    url: required('DATABASE_URL'),
  },
  server: {
    port: parseInt(optional('PORT', '3000'), 10),
    nodeEnv: optional('NODE_ENV', 'development'),
  },
  embedding: {
    provider: optional('EMBED_PROVIDER', 'ollama') as 'ollama' | 'groq',
    dimension: parseInt(optional('EMBED_DIMENSION', '768'), 10),
    model: optional('EMBED_MODEL', 'nomic-embed-text'),
    ollamaUrl: optional('OLLAMA_URL', 'http://localhost:11434'),
  },
  features: {
    emotionTagging: optional('ENABLE_EMOTION_TAGGING', 'false') === 'true',
  },
} as const;

export type Config = typeof config;
