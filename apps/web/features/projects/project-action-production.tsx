"use client";

import { Modal } from "@/features/shared/modal";
import {
  useProductionBrief,
  type DesignBoard,
  type TableRow,
  type WorkflowBoard,
} from "./project-data";
import { ProductionBriefEditor } from "./production-brief-editor";

export type ProductionAction = {
  kind: "production";
  board: DesignBoard;
  workflowBoard: WorkflowBoard;
  project: TableRow<"projects">;
};

export function ProjectActionProduction({
  action,
  onClose,
}: {
  action: ProductionAction;
  onClose: () => void;
}) {
  const query = useProductionBrief(action.board.id);
  if (query.isPending)
    return (
      <Modal open title="Production brief" onClose={onClose}>
        Loading saved instructions…
      </Modal>
    );
  if (query.error)
    return (
      <Modal open title="Production brief" onClose={onClose}>
        <p role="alert">Saved instructions could not be loaded.</p>
        <button className="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </Modal>
    );
  return (
    <ProductionBriefEditor
      board={action.board}
      workflowBoard={action.workflowBoard}
      project={action.project}
      saved={query.data?.draft ?? query.data?.published ?? null}
      onClose={onClose}
    />
  );
}
