import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Setup Replit Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Projects Routes
  app.get(api.projects.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const projects = await storage.getProjects(userId);
    res.json(projects);
  });

  app.post(api.projects.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.projects.create.input.parse(req.body);
      const userId = req.user.claims.sub;
      const project = await storage.createProject({ ...input, ownerId: userId });
      res.status(201).json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.projects.get.path, isAuthenticated, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    // Optional: Check ownership or permission here
    res.json(project);
  });

  // Invitations Routes
  app.get(api.invitations.list.path, isAuthenticated, async (req: any, res) => {
    const email = req.user.claims.email;
    if (!email) {
      return res.json([]); // No email, no invitations
    }
    const invitations = await storage.getInvitations(email);
    res.json(invitations);
  });

  app.post(api.invitations.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.invitations.create.input.parse(req.body);
      const invitation = await storage.createInvitation(input);
      res.status(201).json(invitation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.post(api.invitations.respond.path, isAuthenticated, async (req, res) => {
    const { status } = req.body;
    if (status !== 'accepted' && status !== 'rejected') {
        return res.status(400).json({ message: "Invalid status" });
    }

    try {
        const invitation = await storage.updateInvitationStatus(Number(req.params.id), status);
        if (!invitation) {
            return res.status(404).json({ message: 'Invitation not found' });
        }
        res.json(invitation);
    } catch (error) {
         res.status(500).json({ message: "Failed to update invitation" });
    }
  });

  return httpServer;
}

// Seed function to add some dummy data if needed
// Note: Hard to seed user-specific data without knowing the user ID ahead of time.
// But we can seed some projects for a "demo" user if we wanted, or just leave empty.
async function seedDatabase() {
    // ...
}
