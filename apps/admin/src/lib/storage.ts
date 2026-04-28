const ACCESS_KEY  = 'gfp_access_token';
const REFRESH_KEY = 'gfp_refresh_token';

export const storage = {
  getAccessToken:  ()        => localStorage.getItem(ACCESS_KEY),
  setAccessToken:  (t: string) => localStorage.setItem(ACCESS_KEY, t),
  getRefreshToken: ()        => localStorage.getItem(REFRESH_KEY),
  setRefreshToken: (t: string) => localStorage.setItem(REFRESH_KEY, t),
  clearTokens:     ()        => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
