import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cloud, Shield, FolderOpen, Loader2, ArrowRight, Sparkles, Camera, Image, Lock, User, Mail, Check, Zap, HardDrive } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            ux_mode?: string;
            allowed_parent_origin?: string[];
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme?: string;
              size?: string;
              width?: number;
              text?: string;
              shape?: string;
              logo_alignment?: string;
            }
          ) => void;
        };
      };
    };
  }
}

export default function Landing() {
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleScriptLoaded, setGoogleScriptLoaded] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const { login, register, googleLogin, isLoggingIn, isRegistering, isGoogleLoggingIn, loginError, registerError } = useAuth();
  const { toast } = useToast();

  const isSubmitting = isLoggingIn || isRegistering;
  const error = mode === "login" ? loginError : registerError;

  const googleCallbackRef = useRef<(response: any) => void>();
  googleCallbackRef.current = async (response: any) => {
    if (!response?.credential) {
      toast({
        title: "Google login failed",
        description: "No credential received from Google. Please try again.",
        variant: "destructive",
      });
      return;
    }
    try {
      await googleLogin({ credential: response.credential });
      setShowAuth(false);
      resetForm();
    } catch (err) {
      toast({
        title: "Google login failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleGoogleCallback = useCallback((response: any) => {
    googleCallbackRef.current?.(response);
  }, []);

  useEffect(() => {
    fetch("/api/auth/google-client-id")
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        if (data?.clientId) setGoogleClientId(data.clientId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!googleClientId || googleScriptLoaded) return;
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      setGoogleScriptLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleScriptLoaded(true);
    document.head.appendChild(script);
  }, [googleClientId, googleScriptLoaded]);

  const renderGoogleButton = useCallback((container: HTMLDivElement) => {
    if (!googleClientId || !window.google) return;
    container.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCallback,
      ux_mode: "popup",
      allowed_parent_origin: [window.location.origin],
    });
    const buttonWidth = Math.min(container.offsetWidth || 392, 392);
    window.google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      width: buttonWidth,
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
    });
  }, [googleClientId, handleGoogleCallback]);

  const googleBtnCallbackRef = useCallback((node: HTMLDivElement | null) => {
    googleBtnRef.current = node;
    if (node && googleScriptLoaded) {
      renderGoogleButton(node);
    }
  }, [googleScriptLoaded, renderGoogleButton]);

  useEffect(() => {
    if (googleScriptLoaded && googleBtnRef.current) {
      renderGoogleButton(googleBtnRef.current);
    }
  }, [googleScriptLoaded, renderGoogleButton]);

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
    <div className="min-h-screen bg-background overflow-hidden">
      <nav className="border-b border-border/40 backdrop-blur-md fixed w-full top-0 z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <img src="/favicon.png" alt="goyoyd" className="w-9 h-9 rounded-md shadow-lg shadow-violet-500/30" />
              <span className="text-xl font-bold font-display tracking-tight text-foreground">goyoyd</span>
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
                className="bg-gradient-to-r from-violet-600 to-fuchsia-500 border-violet-600 text-white"
                onClick={openRegister}
                data-testid="button-get-started"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative pt-24 pb-16 sm:pt-28 sm:pb-20 lg:pt-36 lg:pb-24 px-4">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-violet-400/20 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-fuchsia-400/15 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-1/3 w-64 h-64 bg-amber-300/10 rounded-full blur-3xl" />
          <div className="absolute top-10 right-10 w-48 h-48 bg-cyan-400/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-semibold">
              Your Photos, Your Cloud, Your Way
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold font-display tracking-tight text-foreground mb-6 leading-tight">
            You Own It.{" "}
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">
              We Just Help You See It.
            </span>
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
            Where Data Belongs to Its Owner.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-gradient-to-r from-violet-600 to-fuchsia-500 border-violet-600 text-white text-base px-8"
              onClick={openRegister}
              data-testid="button-start-free"
            >
              Start for free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={openLogin}
              data-testid="button-hero-sign-in"
            >
              Sign in to your account
            </Button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-5 mt-12 sm:mt-20 max-w-4xl mx-auto">
            <FeatureCard
              icon={<Cloud className="w-6 h-6" />}
              gradient="from-violet-500 to-indigo-600"
              title="Works With Your Cloud"
              description="Supports Amazon, Google, and Microsoft cloud storage. Your photos stay where you want them."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              gradient="from-emerald-500 to-teal-600"
              title="Your Files, Locked Down"
              description="Your account and files are protected with bank-level security. Only you can access your data."
            />
            <FeatureCard
              icon={<Image className="w-6 h-6" />}
              gradient="from-amber-500 to-orange-600"
              title="Full Control"
              description="Upload, download, create folders, and delete files all from one interface."
            />
          </div>
        </div>
      </div>

      <div className="relative py-16 sm:py-24 px-4">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-violet-400/10 via-fuchsia-400/10 to-amber-400/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-sm font-medium mb-6">
            <Zap className="w-4 h-4 text-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Simple, Honest Pricing</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold font-display tracking-tight text-foreground mb-4">
            Start free. Pay only for what you use.
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            No subscriptions, no hidden fees. Just storage that scales with you.
          </p>
        </div>

        <div className="max-w-3xl mx-auto grid sm:grid-cols-2 gap-6">
          <div className="relative p-6 sm:p-8 rounded-xl bg-card border border-border/50 text-left" data-testid="pricing-free">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Free Tier</p>
                <p className="text-2xl font-bold">5 GB</p>
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-bold mb-1">
              $0<span className="text-lg font-normal text-muted-foreground">/month</span>
            </p>
            <p className="text-sm text-muted-foreground mb-6">Every month, on us.</p>
            <ul className="space-y-3">
              <PricingFeature text="5 GB of uploads every month" />
              <PricingFeature text="Unlimited file browsing" />
              <PricingFeature text="Folder management" />
              <PricingFeature text="File sharing via link" />
              <PricingFeature text="Image preview with gallery" />
            </ul>
            <Button
              className="w-full mt-8 bg-gradient-to-r from-violet-600 to-fuchsia-500 border-violet-600 text-white"
              onClick={openRegister}
              data-testid="button-pricing-free"
            >
              Get Started Free
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>

          <div className="relative p-6 sm:p-8 rounded-xl bg-card border-2 border-amber-500/40 text-left shadow-lg shadow-amber-500/5" data-testid="pricing-pro">
            <div className="absolute -top-3 right-6 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold uppercase tracking-wider">
              Pay as you go
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Beyond 5 GB</p>
                <p className="text-2xl font-bold">Unlimited</p>
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-bold mb-1">
              $0.10<span className="text-lg font-normal text-muted-foreground">/GB</span>
            </p>
            <p className="text-sm text-muted-foreground mb-6">Only charged when you exceed 5 GB.</p>
            <ul className="space-y-3">
              <PricingFeature text="Everything in Free" />
              <PricingFeature text="Unlimited storage capacity" />
              <PricingFeature text="Automatic monthly billing" />
              <PricingFeature text="Secure card-on-file payment" />
              <PricingFeature text="No commitments, cancel anytime" />
            </ul>
            <Button
              variant="outline"
              className="w-full mt-8 border-amber-500/40 hover:bg-amber-500/10"
              onClick={openRegister}
              data-testid="button-pricing-pro"
            >
              Start Free, Upgrade Later
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8 max-w-md mx-auto">
          Billing is based on cumulative uploads per month. Deletions don't reduce usage. No card needed to start.
        </p>
      </div>

      <footer className="py-8 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; 2024 goyoyd. All rights reserved.</p>
        </div>
      </footer>

      <Dialog open={showAuth} onOpenChange={setShowAuth}>
        <DialogContent className="sm:max-w-[440px] p-0 border-0 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-br from-violet-600 via-fuchsia-500 to-amber-500 p-6 pb-8 text-white">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <img src="/favicon.png" alt="goyoyd" className="w-10 h-10 rounded-md bg-white/20 backdrop-blur-sm" />
                <span className="text-lg font-bold font-display">goyoyd</span>
              </div>
              <DialogTitle className="text-2xl font-bold text-white" data-testid="text-dialog-title">
                {mode === "login" ? "Welcome back" : "Create an account"}
              </DialogTitle>
              <p className="text-white/80 text-sm mt-1">
                {mode === "login"
                  ? "Sign in to access your cloud storage"
                  : "Join thousands of photographers worldwide"}
              </p>
            </DialogHeader>
          </div>
          <div className="p-6 pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="username"
                        type="text"
                        placeholder="johndoe"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        minLength={3}
                        maxLength={30}
                        className="pl-10"
                        data-testid="input-username"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-sm font-medium">First name</Label>
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
                      <Label htmlFor="lastName" className="text-sm font-medium">Last name</Label>
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
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10"
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={mode === "register" ? "At least 6 characters" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === "register" ? 6 : undefined}
                    className="pl-10"
                    data-testid="input-password"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive" data-testid="text-error">
                  {error.message}
                </p>
              )}

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-500 border-violet-600 text-white"
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

              {googleClientId && (
                <>
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                  <div className="relative">
                    {isGoogleLoggingIn && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-md">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div
                      ref={googleBtnCallbackRef}
                      className="flex justify-center"
                      data-testid="google-signin-button"
                    />
                  </div>
                </>
              )}

              <p className="text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("register")}
                      className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-semibold"
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
                      className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-semibold"
                      data-testid="button-switch-to-login"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureCard({ icon, gradient, title, description }: { icon: React.ReactNode; gradient: string; title: string; description: string }) {
  return (
    <div className="relative group text-left p-6 rounded-md bg-card border border-border/50 hover-elevate">
      <div className={`w-12 h-12 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center text-white mb-4 shadow-lg`}>
        {icon}
      </div>
      <h3 className="text-base font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function PricingFeature({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
      <span>{text}</span>
    </li>
  );
}
