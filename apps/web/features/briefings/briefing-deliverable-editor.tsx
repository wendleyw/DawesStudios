"use client";

import { X } from "lucide-react";
import { formatSize, formats, type RequestedDeliverable } from "./briefing-model";

export function BriefingDeliverableEditor({
  item,
  onChange,
  onRemove,
}: {
  item: RequestedDeliverable;
  onChange: (patch: Partial<RequestedDeliverable>) => void;
  onRemove: () => void;
}) {
  const format = formats.find((value) => value.id === item.format);
  return (
    <div className="deliverable-editor">
      <div className="deliverable-editor-heading">
        <span>
          {format?.name ?? item.format} <small>{formatSize(item)}</small>
        </span>
        <button className="icon-button" aria-label={`Remove ${item.name}`} onClick={onRemove}>
          <X size={16} />
        </button>
      </div>
      <div className="deliverable-basics">
        <label>
          Custom name
          <input value={item.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label>
          Quantity
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={item.quantity}
            onChange={(event) => onChange({ quantity: Number(event.target.value) })}
          />
        </label>
        <label>
          Design approach
          <select
            value={item.scope}
            onChange={(event) =>
              onChange({ scope: event.target.value as RequestedDeliverable["scope"] })
            }
          >
            <option value="original">New design</option>
            <option value="adaptation">Adapt an existing design</option>
          </select>
        </label>
      </div>
      {format?.layout !== "none" && (
        <details
          className="deliverable-size-settings"
          open={
            item.format.startsWith("custom-") ||
            item.width !== format?.width ||
            (format?.layout === "fixed" && item.height !== format.height)
          }
        >
          <summary>Size settings</summary>
          <p className="briefing-note">
            The standard size is already filled in. Change it only if you need a different size.
          </p>
          <div className="deliverable-fields">
            <label>
              Width ({format?.unit})
              <input
                type="number"
                min={1}
                step={1}
                value={item.width ?? ""}
                onChange={(event) =>
                  onChange({ width: event.target.value ? Number(event.target.value) : undefined })
                }
              />
            </label>
            {format?.layout === "fixed" && (
              <label>
                Height ({format.unit})
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={item.height ?? ""}
                  onChange={(event) =>
                    onChange({
                      height: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                />
              </label>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
