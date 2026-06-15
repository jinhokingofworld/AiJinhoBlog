export const DEFAULT_PROFILE_IMAGE_URL = "/default-profile.svg";
export const DEFAULT_COVER_IMAGE_URL = "/default-cover.svg";

type ProfileRecord = {
  id: string;
  username: string;
  name: string;
  intro: string | null;
  blogTitle: string;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
};

export const profileSelect = {
  id: true,
  username: true,
  name: true,
  intro: true,
  blogTitle: true,
  profileImageUrl: true,
  coverImageUrl: true,
} as const;

export function getDefaultIntro(username: string) {
  return `안녕하세요 ${username}입니다.`;
}

export function serializeProfile(user: ProfileRecord) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    intro: user.intro ?? getDefaultIntro(user.username),
    blogTitle: user.blogTitle,
    profileImageUrl: user.profileImageUrl ?? DEFAULT_PROFILE_IMAGE_URL,
    coverImageUrl: user.coverImageUrl ?? DEFAULT_COVER_IMAGE_URL,
  };
}
