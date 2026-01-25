import { projects, invitations, type Project, type InsertProject, type Invitation, type InsertInvitation, type UpdateInvitationStatusRequest } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;

  // Invitations
  getInvitations(email: string): Promise<(Invitation & { project?: Project })[]>;
  getInvitation(id: number): Promise<Invitation | undefined>;
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  updateInvitationStatus(id: number, status: "accepted" | "rejected"): Promise<Invitation>;
}

export class DatabaseStorage implements IStorage {
  // Projects
  async getProjects(userId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.ownerId, userId));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  // Invitations
  async getInvitations(email: string): Promise<(Invitation & { project?: Project })[]> {
    // Join with projects to get project details
    const results = await db
      .select({
        invitation: invitations,
        project: projects,
      })
      .from(invitations)
      .leftJoin(projects, eq(invitations.projectId, projects.id))
      .where(eq(invitations.email, email));

    return results.map(row => ({
      ...row.invitation,
      project: row.project || undefined,
    }));
  }

  async getInvitation(id: number): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, id));
    return invitation;
  }

  async createInvitation(insertInvitation: InsertInvitation): Promise<Invitation> {
    const [invitation] = await db.insert(invitations).values(insertInvitation).returning();
    return invitation;
  }

  async updateInvitationStatus(id: number, status: "accepted" | "rejected"): Promise<Invitation> {
    const [updated] = await db
      .update(invitations)
      .set({ status })
      .where(eq(invitations.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
