"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/features/shared/modal";
import { BriefingEditorPage } from "./briefing-editor";

export function NewBriefingModal({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [editorState, setEditorState] = useState({ busy: false, dirty: false });
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  function close() {
    if (editorState.busy) return;
    if (editorState.dirty && !submitted) setConfirmClose(true);
    else router.back();
  }
  return (
    <Modal
      open
      onClose={close}
      title={submitted ? "Briefing sent" : "New briefing"}
      size="lg"
      closeDisabled={editorState.busy}
    >
      {submitted ? (
        <div className="briefing-modal-confirmation">
          <p>Your briefing is ready for the studio to review. No credits have been used.</p>
          <button className="button primary" onClick={() => router.back()}>
            Done
          </button>
        </div>
      ) : (
        <>
          {confirmClose && (
            <div className="briefing-modal-confirmation" role="alert">
              <p>You have unsaved changes. Close this briefing?</p>
              <div className="form-actions">
                <button className="button" onClick={() => setConfirmClose(false)}>
                  Keep editing
                </button>
                <button className="button" onClick={() => router.back()}>
                  Discard changes
                </button>
              </div>
            </div>
          )}
          <div hidden={confirmClose}>
            <BriefingEditorPage
              clientId={clientId}
              dialog={{
                onStateChange: setEditorState,
                onSubmitted: () => {
                  setEditorState({ busy: false, dirty: false });
                  setSubmitted(true);
                },
              }}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
