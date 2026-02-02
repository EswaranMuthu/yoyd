import { Button } from "@/components/ui/button";
import { ArrowRight, Cloud, Shield, Zap, FolderOpen } from "lucide-react";

export default function Landing() {
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
            <div>
              <Button asChild className="shadow-lg shadow-primary/20 transition-all duration-300" data-testid="button-get-started">
                <a href="/api/login">
                  Get Started
                </a>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-20 lg:pt-48 lg:pb-32 px-4 overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10" />
        
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 animate-enter" style={{ animationDelay: "0ms" }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Secure S3 Storage Browser
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-bold font-display tracking-tight text-foreground mb-6 animate-enter" style={{ animationDelay: "100ms" }}>
            Browse your cloud storage <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
              with clarity
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed animate-enter" style={{ animationDelay: "200ms" }}>
            A beautiful interface for managing your AWS S3 buckets. Browse files, upload content, create folders, and organize your cloud storage effortlessly.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-enter" style={{ animationDelay: "300ms" }}>
            <Button size="lg" className="shadow-xl shadow-primary/25 transition-all" asChild data-testid="button-start-free">
              <a href="/api/login">
                Start for free <ArrowRight className="ml-2 w-5 h-5" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="py-24 bg-muted/30 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Cloud className="w-6 h-6 text-blue-500" />}
              title="S3 Integration"
              description="Connect directly to your AWS S3 buckets and browse files with ease."
            />
            <FeatureCard 
              icon={<Shield className="w-6 h-6 text-green-500" />}
              title="Secure Access"
              description="Authenticated access with Replit Auth keeps your data protected."
            />
            <FeatureCard 
              icon={<FolderOpen className="w-6 h-6 text-purple-500" />}
              title="Full Control"
              description="Upload, download, create folders, and delete files all from one interface."
            />
          </div>
        </div>
      </div>
      
      <footer className="py-12 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; 2024 hexaprotal1. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-card p-8 rounded-md border border-border/50 transition-all duration-300">
      <div className="w-12 h-12 rounded-md bg-background border border-border flex items-center justify-center mb-6 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
