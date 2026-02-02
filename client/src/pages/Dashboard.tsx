import { useAuth } from "@/hooks/use-auth";
import { useProjects } from "@/hooks/use-projects";
import { useInvitations, useRespondInvitation } from "@/hooks/use-invitations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { InviteUserDialog } from "@/components/InviteUserDialog";
import { Loader2, LogOut, LayoutDashboard, Settings, User, FolderKanban, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: invitations, isLoading: invitationsLoading } = useInvitations();
  const { mutate: respondInvitation } = useRespondInvitation();

  const pendingInvitations = invitations?.filter(inv => inv.status === 'pending') || [];

  return (
    <div className="min-h-screen bg-muted/20 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border hidden md:flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display shadow-lg shadow-primary/25">
              H
            </div>
            <span className="text-lg font-bold font-display tracking-tight">hexaprotal1</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <Button variant="secondary" className="w-full justify-start gap-3 bg-secondary/50 font-medium">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground">
            <FolderKanban className="w-4 h-4" />
            Projects
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="w-8 h-8 border border-border">
              <AvatarImage src={user?.profileImageUrl} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => logout()}>
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 lg:p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, {user?.firstName}!</p>
          </div>
          <div className="flex gap-3">
            <InviteUserDialog />
            <CreateProjectDialog />
          </div>
        </header>

        {/* Invitations Section - Only show if pending exist */}
        {pendingInvitations.length > 0 && (
          <section className="mb-10 animate-enter">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              Pending Invitations
              <Badge variant="secondary" className="rounded-full">{pendingInvitations.length}</Badge>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingInvitations.map((invitation) => (
                <Card key={invitation.id} className="border-l-4 border-l-blue-500 shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium text-muted-foreground">You've been invited to</CardTitle>
                    <div className="text-xl font-bold text-foreground">{invitation.project?.name || "Unknown Project"}</div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {invitation.project?.description || "No description provided."}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-end gap-2 pt-0">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => respondInvitation({ id: invitation.id, status: 'rejected' })}
                    >
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => respondInvitation({ id: invitation.id, status: 'accepted' })}
                    >
                      <Check className="w-4 h-4 mr-1" /> Accept
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            <Separator className="my-8" />
          </section>
        )}

        {/* Projects Grid */}
        <section>
          <h2 className="text-xl font-bold mb-6">Your Projects</h2>
          
          {projectsLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border/60">
              <FolderKanban className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No projects yet</h3>
              <p className="text-muted-foreground mb-6">Create your first project to get started.</p>
              <CreateProjectDialog />
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects?.map((project, idx) => (
                <Card 
                  key={project.id} 
                  className="group hover:shadow-xl hover:border-primary/20 transition-all duration-300 animate-enter"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                        <FolderKanban className="w-5 h-5" />
                      </div>
                      {project.ownerId === user?.id && (
                        <Badge variant="outline" className="bg-background">Owner</Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl">{project.name}</CardTitle>
                    <CardDescription className="line-clamp-2 min-h-[40px]">
                      {project.description || "No description provided."}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="text-xs text-muted-foreground border-t border-border/50 pt-4 mt-auto">
                    Created {format(new Date(project.createdAt!), 'MMM d, yyyy')}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
