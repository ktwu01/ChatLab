/**
 * @openchatlab/config
 *
 * ChatLab 配置管理：TOML/JSON 文件读取 + CHATLAB_* 环境变量覆盖 + Zod 校验。
 */

export { loadConfig, getConfigPath, getConfigDir, writeConfigField } from './loader'
export { configSchema } from './schema'
export type { ChatLabConfig, LlmConfig, DataConfig, ApiConfig, LocaleConfig } from './schema'
export {
  loadAuthProfiles,
  getApiKeyByProfile,
  getApiKeyByProvider,
  resolveApiKey,
  writeAuthProfile,
  deleteAuthProfile,
} from './auth-profiles'
export type { AuthProfile, AuthProfilesData } from './auth-profiles'
