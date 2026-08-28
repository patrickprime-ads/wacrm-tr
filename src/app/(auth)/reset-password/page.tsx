"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      setValidSession(Boolean(data.session));
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setValidSession(true);
        setChecking(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setError("As senhas informadas não são iguais.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await createClient().auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError("Não foi possível alterar a senha. Solicite um novo link.");
      return;
    }

    setSuccess(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {success ? (
              <CheckCircle className="h-6 w-6 text-primary" />
            ) : (
              <KeyRound className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl text-foreground">
            {success ? "Senha alterada" : "Criar nova senha"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {success
              ? "Sua nova senha foi salva com sucesso."
              : "Escolha uma senha segura para acessar o CRM."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <Link href="/painel">
              <Button className="w-full">Entrar no CRM</Button>
            </Link>
          ) : checking ? (
            <p className="text-center text-sm text-muted-foreground">
              Verificando o link...
            </p>
          ) : !validSession ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-400">
                Este link expirou ou não é válido.
              </p>
              <Link href="/forgot-password">
                <Button variant="outline" className="w-full">
                  Solicitar novo link
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmation">Confirmar nova senha</Label>
                <Input
                  id="confirmation"
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={loading} className="mt-2 w-full">
                {loading ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
