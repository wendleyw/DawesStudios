"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { Json } from "@database";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { assertResult } from "@/lib/supabase";
import {
  fieldsForSection,
  parseSectionInput,
  readPalette,
  readProducts,
  sectionFields,
  validationMessage,
  type EditableSectionId,
} from "./brand-model";
import { FormError } from "@/features/shared/form-error";

export function SectionEditor({
  clientId,
  section,
  title,
  content,
  onClose,
}: {
  clientId: string;
  section: EditableSectionId;
  title: string;
  content: Json | undefined;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();
  const [fields, setFields] = useState(() => fieldsForSection(section, content));
  const [palette, setPalette] = useState(() => readPalette(content));
  const [products, setProducts] = useState(() => readProducts(content));
  const save = useMutation({
    mutationFn: async () => {
      const validated = parseSectionInput(section, fields, palette, products);
      assertResult(
        await database
          .from("brand_sections")
          .upsert(
            {
              client_id: clientId,
              section,
              content: validated,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "client_id,section" },
          )
          .select("section")
          .single(),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["brand-sections"] }),
        queryClient.invalidateQueries({ queryKey: ["briefing-brand"] }),
      ]);
      onClose();
    },
  });
  return (
    <Modal
      open
      title={`Edit ${title.toLowerCase()}`}
      description="Keep the shared brand guidance clear and current."
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="button quiet"
            disabled={save.isPending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" form={formId} className="button primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {sectionFields[section].map((field) => (
          <label key={field.key}>
            {field.label}
            {field.kind === "multiline" || field.kind === "lines" ? (
              <textarea
                aria-label={field.label}
                value={fields[field.key] ?? ""}
                maxLength={field.maxLength ?? 6000}
                onChange={(event) => setFields({ ...fields, [field.key]: event.target.value })}
                required={field.required}
                rows={field.kind === "lines" ? 4 : 5}
              />
            ) : (
              <input
                aria-label={field.label}
                type={field.kind === "url" ? "url" : "text"}
                placeholder={field.kind === "url" ? "https://" : undefined}
                value={fields[field.key] ?? ""}
                maxLength={field.maxLength ?? 300}
                required={field.required}
                onChange={(event) => setFields({ ...fields, [field.key]: event.target.value })}
              />
            )}
          </label>
        ))}
        {section === "colors" && (
          <>
            <div className="brand-repeater">
              {palette.map((color, index) => (
                <div className="brand-color-input" key={index}>
                  <label>
                    Color name
                    <input
                      value={color.name}
                      required
                      maxLength={300}
                      onChange={(event) =>
                        setPalette(
                          palette.map((item, i) =>
                            i === index ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    HEX value
                    <input
                      value={color.hex}
                      required
                      pattern="#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?"
                      onChange={(event) =>
                        setPalette(
                          palette.map((item, i) =>
                            i === index ? { ...item, hex: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove color ${index + 1}`}
                    onClick={() => setPalette(palette.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button"
              disabled={palette.length >= 20}
              onClick={() => setPalette([...palette, { name: "", hex: "#191919" }])}
            >
              <Plus size={15} />
              Add color
            </button>
          </>
        )}
        {section === "products" && (
          <>
            <div className="brand-repeater">
              {products.map((product, index) => (
                <fieldset className="brand-product-input" key={index}>
                  <legend>Product {index + 1}</legend>
                  {(
                    [
                      ["name", "Product name"],
                      ["description", "Description"],
                      ["specs", "Specifications"],
                      ["rules", "Usage guidance"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        value={product[key]}
                        required={key === "name"}
                        maxLength={key === "name" ? 300 : 6000}
                        onChange={(event) =>
                          setProducts(
                            products.map((item, i) =>
                              i === index ? { ...item, [key]: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="button quiet"
                    onClick={() => setProducts(products.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={14} />
                    Remove product
                  </button>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              className="button"
              disabled={products.length >= 50}
              onClick={() =>
                setProducts([...products, { name: "", description: "", specs: "", rules: "" }])
              }
            >
              <Plus size={15} />
              Add product
            </button>
          </>
        )}
        {save.error && <FormError>{validationMessage(save.error)}</FormError>}
      </form>
    </Modal>
  );
}
