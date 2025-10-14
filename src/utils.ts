import type { User as SlackUser } from '@slack/web-api/dist/types/response/UsersInfoResponse'

export function getSlackUserDisplayFields(user?: SlackUser) {
  if (!user?.profile) return {}
  const avatarURL =
    user.profile.image_original ||
    user.profile.image_1024 ||
    user.profile.image_512 ||
    user.profile.image_192 // should be enough...
  const username =
    user.profile.display_name || user.profile.real_name || user.name
  return { avatarURL, username }
}
