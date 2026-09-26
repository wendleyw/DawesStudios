"use client";

import { ArrowUpRight, ImageIcon, Pencil } from "lucide-react";
import type { Json } from "@database";
import { useBrandAssets } from "./brand-data";
import { AssetPreview } from "./brand-assets";
import { readProducts, safeHttpsUrl } from "./brand-model";

/**
 * The client's products, opened from the Products tile in Assets: each card shows the product's image (one of the
 * client's brand assets), name, description and link, with specifications and usage guidance one
 * click away. Hidden for readers while there are no products; the agency always sees it to add one.
 */
export function BrandProducts({
  clientId,
  content,
  onEdit,
}: {
  clientId: string;
  content: Json | undefined;
  /** Present for the agency, who edits the products. */
  onEdit?: () => void;
}) {
  const products = readProducts(content);
  const assets = useBrandAssets(
    clientId,
    products.some((product) => product.imageAssetId),
  );
  if (!products.length && !onEdit) return null;
  return (
    <section className="brand-products" aria-labelledby="brand-products-title">
      <div className="brand-products-heading">
        {/* The folder path above already names Products; the heading stays for the region's name. */}
        <h3 id="brand-products-title" className="visually-hidden">
          Products
        </h3>
        {onEdit && (
          <button className="button quiet" onClick={onEdit}>
            <Pencil size={14} />
            Edit products
          </button>
        )}
      </div>
      {products.length ? (
        <div className="brand-products-grid">
          {products.map((product, index) => {
            const image = assets.data?.find((asset) => asset.id === product.imageAssetId);
            const link = safeHttpsUrl(product.link);
            return (
              <article className="brand-product-card" key={index}>
                {image ? (
                  <AssetPreview asset={image} decorative />
                ) : (
                  <div className="brand-asset-preview">
                    <ImageIcon size={26} aria-hidden="true" />
                    <span>No image</span>
                  </div>
                )}
                <div className="brand-product-body">
                  <h4>{product.name}</h4>
                  {product.description && <p>{product.description}</p>}
                  {(product.specs || product.rules) && (
                    <details>
                      <summary>Details</summary>
                      {product.specs && (
                        <>
                          <h5>Specifications</h5>
                          <p>{product.specs}</p>
                        </>
                      )}
                      {product.rules && (
                        <>
                          <h5>Usage guidance</h5>
                          <p>{product.rules}</p>
                        </>
                      )}
                    </details>
                  )}
                  {link && (
                    <a
                      className="button quiet"
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open link
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="brand-muted">No products yet. Add one with an image and a link.</p>
      )}
    </section>
  );
}
