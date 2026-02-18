import { db } from "../db";
import { users, refreshTokens, type User } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  createUser(username: string, email: string, passwordHash: string, firstName?: string, lastName?: string): Promise<User>;
  createGoogleUser(username: string, email: string, googleSub: string, firstName?: string, lastName?: string, profileImageUrl?: string): Promise<User>;
  linkGoogleAccount(userId: string, googleSub: string, profileImageUrl?: string): Promise<void>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  getUserByGoogleSub(googleSub: string): Promise<User | null>;
  updateUserStorageBytes(username: string, totalBytes: number): Promise<void>;
  resetMaxStorageBytes(username: string): Promise<void>;
  saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getRefreshToken(token: string): Promise<{ userId: string; expiresAt: Date } | null>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteUserRefreshTokens(userId: string): Promise<void>;
}

export const authStorage: IAuthStorage = {
  async createUser(username: string, email: string, passwordHash: string, firstName?: string, lastName?: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        username,
        email,
        password: passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
      })
      .returning();
    return user;
  },

  async linkGoogleAccount(userId: string, googleSub: string, profileImageUrl?: string): Promise<void> {
    await db
      .update(users)
      .set({
        authProvider: "google",
        googleSub,
        ...(profileImageUrl ? { profileImageUrl } : {}),
      })
      .where(eq(users.id, userId));
  },

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user || null;
  },

  async getUserByUsername(username: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user || null;
  },

  async createGoogleUser(username: string, email: string, googleSub: string, firstName?: string, lastName?: string, profileImageUrl?: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        username,
        email,
        password: null,
        authProvider: "google",
        googleSub,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: profileImageUrl || null,
      })
      .returning();
    return user;
  },

  async getUserById(id: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user || null;
  },

  async getUserByGoogleSub(googleSub: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
    return user || null;
  },

  async saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(refreshTokens).values({ userId, token, expiresAt });
  },

  async getRefreshToken(token: string): Promise<{ userId: string; expiresAt: Date } | null> {
    const [result] = await db
      .select({ userId: refreshTokens.userId, expiresAt: refreshTokens.expiresAt })
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);
    return result || null;
  },

  async deleteRefreshToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  },

  async updateUserStorageBytes(username: string, totalBytes: number): Promise<void> {
    const [user] = await db.select({ maxStorageBytes: users.maxStorageBytes }).from(users).where(eq(users.username, username)).limit(1);
    const currentMax = user?.maxStorageBytes ?? 0;
    const newMax = Math.max(currentMax, totalBytes);
    await db
      .update(users)
      .set({ totalStorageBytes: totalBytes, maxStorageBytes: newMax, updatedAt: new Date() })
      .where(eq(users.username, username));
  },

  async resetMaxStorageBytes(username: string): Promise<void> {
    const [user] = await db.select({ totalStorageBytes: users.totalStorageBytes }).from(users).where(eq(users.username, username)).limit(1);
    await db
      .update(users)
      .set({ maxStorageBytes: user?.totalStorageBytes ?? 0, updatedAt: new Date() })
      .where(eq(users.username, username));
  },

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  },
};
