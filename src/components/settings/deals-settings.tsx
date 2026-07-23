"use client";

import { Coins } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

export function DealsSettings() {
  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Negócios e moeda"
        description="Moeda usada nos negócios, funil e indicadores do CRM."
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" /> Moeda do Brasil
          </CardTitle>
          <CardDescription>
            Todos os valores são registrados e exibidos em reais brasileiros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex max-w-xs items-center justify-between rounded-lg border bg-muted px-3 py-2 text-sm">
            <span>Real brasileiro</span><strong>BRL · R$</strong>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
