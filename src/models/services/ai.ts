import { post } from "./http";
import { RequestOptions } from "../interfaces/request";

// ── Shared types ───────────────────────────────────────────────────

interface AIPromptTemplate {
  template: string;
}

interface AIChoice {
  output: string;
}

interface AIResponse {
  prompt: string;
  choices: AIChoice[];
  modelId?: string;
  isCustomerModel?: boolean;
}

// ── Text Generation ────────────────────────────────────────────────

interface TextGenerationRequest {
  input: string;
  promptTemplate?: AIPromptTemplate;
  parameters?: Record<string, string>;
  model?: string;
}

// ── Text-to-SQL ────────────────────────────────────────────────────

interface DataSourceColumn {
  name: string;
  type: string;
}

interface DataSourceSchema {
  dataSourceName: string;
  description?: string;
  columns: DataSourceColumn[];
}

interface TextToSQLRequest {
  input: string;
  dataSourceSchemas?: DataSourceSchema[];
  promptTemplate?: AIPromptTemplate;
  parameters?: Record<string, string>;
  model?: string;
}

// ── Image-to-Text ──────────────────────────────────────────────────

interface AIImage {
  mediaType: string;
  type: "base64";
  data: string;
}

interface ImageToTextRequest {
  input: string;
  image: AIImage;
  model: string;
  promptTemplate?: AIPromptTemplate;
  system?: string;
}

// ── Service functions ──────────────────────────────────────────────

const BASE = "/domo/ai/v1";

/**
 * Generate text from a prompt using Domo's AI Service Layer.
 *
 * @param input - The text prompt.
 * @param opts - Optional: promptTemplate, parameters, model.
 * @param requestOptions - Optional HTTP request options.
 * @returns The AI response with generated text in `choices[0].output`.
 *
 * @example
 * const res = await domo.ai.generateText("Tell me a joke about data.");
 * console.log(res.choices[0].output);
 *
 * @example
 * // With a custom prompt template and parameters:
 * const res = await domo.ai.generateText("Recap the 2021 superbowl", {
 *   promptTemplate: { template: "${input}. Answer in ${max_words} words or less" },
 *   parameters: { max_words: "30" },
 * });
 */
function generateText(
  input: string,
  opts?: Omit<TextGenerationRequest, "input">,
  requestOptions?: RequestOptions,
): Promise<AIResponse> {
  const handle = this?.post ?? post;
  return handle(`${BASE}/text/generation`, { input, ...opts }, requestOptions);
}

/**
 * Generate a SQL query from a natural-language prompt and optional dataset schemas.
 *
 * @param input - The natural-language query description.
 * @param opts - Optional: dataSourceSchemas, promptTemplate, parameters, model.
 * @param requestOptions - Optional HTTP request options.
 * @returns The AI response with the SQL query in `choices[0].output`.
 *
 * @example
 * const res = await domo.ai.textToSQL("Show me total sales by region", {
 *   dataSourceSchemas: [{
 *     dataSourceName: "Sales",
 *     columns: [{ name: "Region", type: "string" }, { name: "Sales", type: "number" }],
 *   }],
 * });
 * console.log(res.choices[0].output);
 */
function textToSQL(
  input: string,
  opts?: Omit<TextToSQLRequest, "input">,
  requestOptions?: RequestOptions,
): Promise<AIResponse> {
  const handle = this?.post ?? post;
  return handle(`${BASE}/text/sql`, { input, ...opts }, requestOptions);
}

/**
 * Extract text from an image using Domo's AI Service Layer.
 *
 * Accepts a base64-encoded image (with or without the `data:` URL prefix).
 *
 * @param input - The prompt describing what to extract (e.g. "return the text in the image").
 * @param image - The image to process: `{ mediaType, type: "base64", data }`.
 * @param model - The model ID to use for image processing.
 * @param opts - Optional: promptTemplate, system prompt.
 * @param requestOptions - Optional HTTP request options.
 * @returns The AI response with extracted text in `choices[0].output`.
 *
 * @example
 * const res = await domo.ai.imageToText(
 *   "return the text in the image",
 *   { mediaType: "image/png", type: "base64", data: base64String },
 *   "domo.domo_ai.domogpt-chat-medium-v1.1:anthropic",
 * );
 * console.log(res.choices[0].output);
 */
function imageToText(
  input: string,
  image: AIImage,
  model: string,
  opts?: { promptTemplate?: AIPromptTemplate; system?: string },
  requestOptions?: RequestOptions,
): Promise<AIResponse> {
  // Strip data URL prefix if present
  const cleanData = image.data.startsWith("data:")
    ? image.data.substring(image.data.indexOf(",") + 1)
    : image.data;

  const handle = this?.post ?? post;
  return handle(
    `${BASE}/image/text`,
    { input, image: { ...image, data: cleanData }, model, ...opts },
    requestOptions,
  );
}

/** AI namespace object exposed as `domo.ai`. */
const ai = {
  generateText,
  textToSQL,
  imageToText,
};

export {
  ai,
  generateText,
  textToSQL,
  imageToText,
  AIResponse,
  AIChoice,
  AIPromptTemplate,
  AIImage,
  TextGenerationRequest,
  TextToSQLRequest,
  ImageToTextRequest,
  DataSourceSchema,
  DataSourceColumn,
};
