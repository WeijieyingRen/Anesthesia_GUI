"use client";

import * as React from "react";

const EXAMPLE_OBSERVATION_SUMMARY = `Shortly after induction, the patient developed hypotension, with blood pressure decreasing from the pre-induction range to a lower post-induction range. The timing suggests that the most likely trigger was induction of anesthesia, causing vasodilation and reduced sympathetic tone. The provider gave phenylephrine, which was clinically relevant and appropriately targeted the hypotension. The patient appeared to respond adequately, with blood pressure improving after the vasopressor. There were no obvious major downstream complications from this episode. Another vasopressor could also have been a reasonable alternative depending on the clinical context.`;

function CollapsibleInstructionPanel({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50 text-blue-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 border-b border-blue-100 bg-blue-100 px-4 py-3 text-left text-sm font-semibold text-blue-950"
      >
        <span className="text-xl font-bold leading-none text-blue-700">
          {open ? "▾" : "▸"}
        </span>
        <span>{title}</span>
      </button>

      {open && (
        <div className="p-4 text-sm leading-6 text-blue-900">{children}</div>
      )}
    </div>
  );
}

export default function ObservationSelectionGuide() {
  return (
    <div className="space-y-3">
      <CollapsibleInstructionPanel
        title="Annotation Instructions"
        defaultOpen={false}
      >
        <div className="space-y-3">
    

          <ol className="ml-5 list-decimal space-y-2">
            <li>
              <strong> Drag directly on the VitalChart to draw a box around a clinically meaningful abnormal episode. </strong>
            </li>

            <li>
              <strong> Select all abnormal episodes that are you think are clinically meaningful.</strong>
            
            </li>

            <li>
              <strong> Multiple selected episodes will appear below. Select one interesting abnormal episode, then click Save and continue.</strong> 
             
            </li>

        
          </ol>
        </div>
      </CollapsibleInstructionPanel>



      <CollapsibleInstructionPanel
        title="FAQ / Common Questions"
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-blue-950">
              What counts as a clinically meaningful abnormal episode?
            </p>
            <p>
              A clinically meaningful episode is an abnormal or important
              physiologic pattern that an anesthesia provider would want to
              explain in context. It does not have to be catastrophic, but it
              should be meaningful enough to justify clinical reasoning.
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              What types of episodes should I look for?
            </p>

            <div className="mt-2 space-y-2">
              <p>
                <span className="font-semibold text-blue-950">
                  • Hemodynamics:
                </span>{" "}
                hypotension, hypertension, bradycardia, tachycardia.
              </p>

              <p>
                <span className="font-semibold text-blue-950">
                  • Oxygenation / ventilation:
                </span>{" "}
                hypoxia, hypercapnia, hypocapnia, tachypnea, bradypnea.
              </p>

              <p>
                <span className="font-semibold text-blue-950">
                  • Temperature / other:
                </span>{" "}
                hypothermia, hyperthermia, or other clinically meaningful
                abnormal patterns.
              </p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              Should I select every tiny fluctuation?
            </p>
            <p>
              No. Please avoid trivial noise or isolated artifact-like
              fluctuations unless they are clinically important or connected to a
              meaningful event, intervention, or physiologic change.
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              Can I select an episode even if I am not sure about the cause?
            </p>
            <p>
              Yes. If the pattern is clinically meaningful, select it. You can
              describe uncertainty later during detailed reasoning.
            </p>
          </div>
        </div>
      </CollapsibleInstructionPanel>
    </div>
  );
}