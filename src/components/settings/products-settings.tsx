"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number | null;
  detail: string | null;
  active: boolean;
};

export function ProductsSettings() {
  const { accountId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Cartões principais");
  const [price, setPrice] = useState("");
  const [detail, setDetail] = useState("");
  const db = createClient();

  async function load() {
    const { data } = await db.from("products").select("*").order("category").order("name");
    setProducts((data as Product[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (accountId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function createProduct() {
    if (!accountId || !name.trim()) return;
    setSaving(true);
    const { error } = await db.from("products").insert({
      account_id: accountId,
      name: name.trim(),
      category,
      price: price ? Number(price) : null,
      detail: detail.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível cadastrar o produto");
    setName("");
    setPrice("");
    setDetail("");
    toast.success("Produto cadastrado");
    await load();
  }

  async function removeProduct(id: string) {
    const { error } = await db.from("products").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir o produto");
    await load();
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Package className="h-5 w-5 text-primary" />Produtos</h2>
        <p className="text-sm text-muted-foreground">Cadastre os blocos que aparecem automaticamente em Nova Venda.</p>
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do produto" />
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border bg-muted px-3 text-sm">
          <option>Cartões principais</option>
          <option>Premium com DIH</option>
          <option>Adicionais / UP</option>
          <option>Serviços avulsos</option>
          <option>Outros</option>
        </select>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
          <Input type="number" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Preço ou deixe vazio" className="pl-10" />
        </div>
        <Input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Descrição curta" />
        <Button onClick={createProduct} disabled={saving || !name.trim()} className="md:col-span-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Cadastrar produto
        </Button>
      </div>
      {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {products.map((product) => (
            <div key={product.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{product.name}</strong>
                <span className="text-xs text-muted-foreground">{product.category} · {product.price == null ? "Valor manual" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.price)}</span>
              </div>
              <button onClick={() => void removeProduct(product.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {!products.length && <p className="text-sm text-muted-foreground">Nenhum produto personalizado. Os blocos padrão continuam disponíveis.</p>}
        </div>
      )}
    </section>
  );
}
