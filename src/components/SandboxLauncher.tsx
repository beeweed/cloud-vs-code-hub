import { useState, useCallback } from "react";
import { Sandbox } from "e2b";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Terminal, Key, Cpu, Loader2, ExternalLink, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const CODE_SERVER_SCRIPT = `#!/bin/bash


PORT=8080
AUTH="none"   # change to "none" if you don't want password
echo "🚀 Starting code-server setup..."
if ! command -v code-server &> /dev/null; then
    echo "📦 Installing code-server..."
    curl -fsSL https://code-server.dev/install.sh | sh
fi
CONFIG_DIR="$HOME/.config/code-server"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
mkdir -p $CONFIG_DIR
if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚙️ Creating default config..."
    cat <<EOF > $CONFIG_FILE
bind-addr: 0.0.0.0:$PORT
auth: $AUTH
password: 123456
cert: false
EOF
fi
echo "🔥 Running code-server on http://localhost:$PORT"
code-server ~
`;

interface SandboxState {
  status: "idle" | "creating" | "installing" | "running" | "ready" | "error";
  url?: string;
  sandboxId?: string;
  error?: string;
}

export default function SandboxLauncher() {
  const [apiKey, setApiKey] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [sandbox, setSandbox] = useState<SandboxState>({ status: "idle" });

  const launch = useCallback(async () => {
    if (!apiKey.trim()) {
      toast({ title: "API Key required", description: "Enter your E2B API key", variant: "destructive" });
      return;
    }
    if (!templateId.trim()) {
      toast({ title: "Template ID required", description: "Enter an E2B sandbox template ID", variant: "destructive" });
      return;
    }

    setSandbox({ status: "creating" });

    try {
      const sbx = await Sandbox.create(templateId.trim(), {
        apiKey: apiKey.trim(),
        timeoutMs: 3_600_000, // 1 hour
      });

      setSandbox({ status: "installing", sandboxId: sbx.sandboxId });

      // Write the script
      await sbx.files.write("/tmp/start-code-server.sh", CODE_SERVER_SCRIPT);
      await sbx.commands.run("chmod +x /tmp/start-code-server.sh");

      setSandbox((s) => ({ ...s, status: "running" }));

      // Run script in background (don't await - it blocks)
      sbx.commands.run("bash /tmp/start-code-server.sh", { timeoutMs: 0 }).catch(() => {});

      // Wait for code-server to be ready
      let ready = false;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const check = await sbx.commands.run("curl -sf http://localhost:8080 > /dev/null && echo OK || echo WAIT", { timeoutMs: 5000 });
          if (check.stdout.trim() === "OK") {
            ready = true;
            break;
          }
        } catch {
          // still starting
        }
      }

      if (!ready) {
        setSandbox({ status: "error", error: "code-server did not start in time. The installation may still be in progress — try a template with code-server pre-installed." });
        return;
      }

      const host = sbx.getHost(8080);
      const url = `https://${host}`;

      setSandbox({ status: "ready", url, sandboxId: sbx.sandboxId });
      toast({ title: "🚀 Sandbox ready!", description: "VS Code is running in your browser" });
    } catch (err: any) {
      setSandbox({ status: "error", error: err?.message || "Failed to create sandbox" });
      toast({ title: "Error", description: err?.message || "Something went wrong", variant: "destructive" });
    }
  }, [apiKey, templateId]);

  const statusText: Record<string, string> = {
    creating: "Creating sandbox...",
    installing: "Uploading code-server script...",
    running: "Installing & starting code-server (this may take a few minutes)...",
    ready: "VS Code is ready!",
  };

  const isLoading = ["creating", "installing", "running"].includes(sandbox.status);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Terminal className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          Cloud<span className="text-primary">Dev</span>
        </h1>
        <span className="text-xs text-muted-foreground ml-1">Powered by E2B</span>
      </header>

      {sandbox.status === "ready" && sandbox.url ? (
        /* Full-screen IDE */
        <div className="flex-1 flex flex-col">
          <div className="bg-card border-b border-border px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              Sandbox: {sandbox.sandboxId}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">No password required</span>
              <a href={sandbox.url} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4 mr-1" /> Open in tab
                </Button>
              </a>
            </div>
          </div>
          <iframe
            src={sandbox.url}
            className="flex-1 w-full border-0"
            title="VS Code"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      ) : (
        /* Launcher */
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-lg bg-card border-border animate-fade-in">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
                <Terminal className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl text-foreground">Launch Cloud IDE</CardTitle>
              <CardDescription className="text-muted-foreground">
                Spin up VS Code in an E2B sandbox with custom CPU & RAM
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-primary" /> E2B API Key
                </label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder="e2b_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isLoading}
                    className="pr-10 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your key at{" "}
                  <a href="https://e2b.dev/dashboard" target="_blank" rel="noopener" className="text-primary hover:underline">
                    e2b.dev/dashboard
                  </a>
                </p>
              </div>

              {/* Template ID */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-accent" /> Template ID
                </label>
                <Input
                  type="text"
                  placeholder="e.g. base, my-custom-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={isLoading}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Custom templates give more RAM & CPU.{" "}
                  <a href="https://e2b.dev/docs/sandbox-template" target="_blank" rel="noopener" className="text-primary hover:underline">
                    Learn more
                  </a>
                </p>
              </div>

              {/* Status */}
              {sandbox.status !== "idle" && sandbox.status !== "error" && (
                <div className="flex items-center gap-2 text-sm text-primary bg-secondary rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {statusText[sandbox.status]}
                </div>
              )}

              {sandbox.status === "error" && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {sandbox.error}
                </div>
              )}

              {/* Launch Button */}
              <Button
                onClick={launch}
                disabled={isLoading}
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Launching...
                  </>
                ) : (
                  <>
                    <Terminal className="h-4 w-4 mr-2" /> Launch VS Code
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Your API key is only used in-browser and never stored on any server.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
