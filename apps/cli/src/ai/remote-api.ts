/**
 * Server-side remote LLM API operations.
 * Thin wrapper over @openchatlab/node-runtime shared implementation.
 */

export {
  fetchRemoteModels,
  validateApiKey,
  type RemoteModel,
  type FetchRemoteModelsResult,
  type RemoteApiOptions,
} from '@openchatlab/node-runtime'
