import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cloud, Shield, FolderOpen, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { login, register, isLoggingIn, isRegistering, loginError, registerError } = useAuth();
  const { toast } = useToast();

  const isSubmitting = isLoggingIn || isRegistering;
  const error = mode === "login" ? loginError : registerError;

  function openRegister() {
    setMode("register");
    setShowAuth(true);
  }

  function openLogin() {
    setMode("login");
    setShowAuth(true);
  }

  function resetForm() {
    setUsername("");
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await register({ username, email, password, firstName, lastName });
      }
      setShowAuth(false);
      resetForm();
    } catch (err) {
      toast({
        title: mode === "login" ? "Login failed" : "Registration failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/40 backdrop-blur-md fixed w-full top-0 z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl font-display shadow-lg shadow-primary/25">
                H
              </div>
              <span className="text-xl font-bold font-display tracking-tight text-foreground">hexaprotal1</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={openLogin}
                data-testid="button-sign-in"
              >
                Sign In
              </Button>
              <Button
                onClick={openRegister}
                data-testid="button-get-started"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-20 lg:pt-40 lg:pb-24 px-4 overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10" />

        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Secure S3 Storage Browser
          </div>

          <h1 className="text-4xl lg:text-6xl font-bold font-display tracking-tight text-foreground mb-6">
            Browse your cloud storage{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
              with clarity
            </span>
          </h1>

          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Cloud Storage Built for Photographers Everywhere.
          </p>

          <Button
            size="lg"
            onClick={openRegister}
            data-testid="button-start-free"
          >
            Start for free
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>

          <div className="grid sm:grid-cols-3 gap-4 mt-16 max-w-3xl mx-auto">
            <FeatureCard
              icon={<Cloud className="w-5 h-5 text-blue-500" />}
              title="S3 Integration"
              description="Connect directly to your AWS S3 buckets and browse files with ease."
            />
            <FeatureCard
              icon={<Shield className="w-5 h-5 text-green-500" />}
              title="Secure Access"
              description="JWT-based authentication keeps your data protected."
            />
            <FeatureCard
              icon={<FolderOpen className="w-5 h-5 text-purple-500" />}
              title="Full Control"
              description="Upload, download, create folders, and delete files all from one interface."
            />
          </div>
        </div>
      </div>

      <footer className="py-8 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; 2024 hexaprotal1. All rights reserved.</p>
        </div>
      </footer>

      <Dialog open={showAuth} onOpenChange={setShowAuth}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {mode === "login" ? "Welcome back" : "Create an account"}
            </DialogTitle>
            <DialogDescription>
              {mode === "login"
                ? "Sign in to access your S3 storage browser"
                : "Get started with your free account"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="johndoe"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={30}
                    data-testid="input-username"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      data-testid="input-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Enter your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 6 : undefined}
                data-testid="input-password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" data-testid="text-error">
                {error.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              data-testid="button-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                mode === "login" ? "Sign in" : "Create account"
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-primary hover:underline font-medium"
                    data-testid="button-switch-to-register"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-primary hover:underline font-medium"
                    data-testid="button-switch-to-login"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="text-left">
      <CardContent className="pt-6">
        <div className="w-10 h-10 rounded-md bg-background border border-border flex items-center justify-center mb-4 shadow-sm">
          {icon}
        </div>
        <h3 className="text-base font-bold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}
