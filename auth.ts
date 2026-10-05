// Google ログイン（Auth.js v5）。パスワードはこのサイトで一切扱わない。
// セッションは暗号化された Cookie（JWE・HttpOnly・Secure・SameSite=Lax）のみで、データベースは使わない。
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** 必要な環境変数がそろっている場合のみログインを有効化（未設定なら従来どおりログインなしで動く） */
export const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  // Auth.js 既定のログイン/エラーページは使わずトップへ戻し、画面上でメッセージを出す
  pages: { signIn: "/", error: "/" },
  callbacks: {
    // メールアドレス確認済みの Google アカウントだけを受け付ける
    signIn: ({ account, profile }) => account?.provider === "google" && profile?.email_verified === true && typeof profile.email === "string",
    // Cookie に入れるのは最小限（メール・表示名）。Google のアクセストークン等は保存しない
    jwt: ({ token, profile }) => {
      if (profile?.email) {
        token.email = profile.email.toLowerCase();
        token.name = typeof profile.name === "string" ? profile.name.slice(0, 80) : profile.email;
      }
      delete token.picture;
      return token;
    },
    session: ({ session, token }) => {
      session.user = { ...session.user, email: token.email ?? "", name: token.name ?? "", image: null };
      return session;
    },
  },
});
