"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function ConsentPage() {
  const router = useRouter();

  const [hasCheckedConsent, setHasCheckedConsent] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const participantRaw = localStorage.getItem("participantInfo");
    if (!participantRaw) {
      router.replace("/");
    }
  }, [router]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const threshold = 8;
    const isAtBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;

    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const canContinue = hasScrolledToBottom && hasCheckedConsent;

  const handleAccept = () => {
    if (!canContinue) return;

    localStorage.setItem(
      "consentInfo",
      JSON.stringify({
        agreed: true,
        timestamp: new Date().toISOString(),
        version: "v1",
      })
    );

    const participantRaw = localStorage.getItem("participantInfo");

    let workflowMode: "annotation" | "review" = "annotation";

    try {
      const participantInfo = participantRaw
        ? JSON.parse(participantRaw)
        : null;

      workflowMode =
        participantInfo?.workflowMode === "review" ||
        localStorage.getItem("loginWorkflowMode") === "review"
          ? "review"
          : "annotation";
    } catch {
      workflowMode =
        localStorage.getItem("loginWorkflowMode") === "review"
          ? "review"
          : "annotation";
    }

    localStorage.setItem("currentWorkflowMode", workflowMode);

    console.log("[Consent] continue with workflowMode:", workflowMode);

    router.push(workflowMode === "review" ? "/review-list" : "/patient-list");
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-2">Consent Letter</h1>

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="space-y-4 text-sm leading-6 text-gray-700 max-h-[65vh] overflow-y-auto border rounded-md p-4 bg-gray-50"
        >
          <p>
            <span className="font-semibold">DESCRIPTION:</span> You are invited
            to participate in a research study evaluating a prototype research
            platform (“VitalLens”) for retrospective review of perioperative
            clinical data (e.g., vital signs, medications, and clinically
            significant intraoperative events) and generation of draft research
            summaries for methodological evaluation.
          </p>

          <p>
            You will be asked to perform study tasks in the VitalLens interface,
            including reviewing selected perioperative cases and responding to
            structured annotation questions within the study platform, such as
            identifying clinically significant events and artifacts.
          </p>

          <p>
            The study platform provides two annotation input formats: free-text
            entry and voice-based input. Depending on the task, you may choose
            to type your annotation directly or use voice input as a convenient
            way to provide your response.
          </p>

          <p>
            For a subset of study tasks, you may also be asked to provide brief
            audio recordings describing your interpretation of selected
            de-identified perioperative data segments. These audio recordings
            will be collected as research data, stored securely on
            Stanford-approved systems, and accessed only by authorized study
            personnel. Audio recordings and any derived transcripts will be used
            only for research purposes and will not be publicly released.
            Recordings may be transcribed for annotation collection and
            analysis. Any excerpts used in publications or presentations will be
            de-identified.
          </p>

          <p>
            This research study is looking for approximately 40 individuals to
            be enrolled in total. Stanford University expects to enroll
            approximately 40 research study participants, including about 15
            Stanford-affiliated clinician participants and about 25 external
            clinician participants.
          </p>

          <p className="font-semibold">
            Future use of Private Information and/or Specimens
          </p>

          <p>
            Research using private information is an important way to try to
            understand human disease. You are being given this information
            because the investigators want to save private information for
            future research.
          </p>

          <p>
            Identifiers might be removed from identifiable private information
            and, after such removal, the information could be used for future
            research studies or distributed to another investigator for future
            research studies without additional informed consent from you.
          </p>

          <p>
            <span className="font-semibold">RISKS AND BENEFITS:</span> The risks
            associated with this study are minimal. There are no physical risks
            because participation involves reviewing de-identified perioperative
            cases, completing annotation tasks within the VitalLens study
            platform, and, for a subset of tasks, optionally providing brief
            audio recordings describing your interpretation. The primary
            foreseeable risks are the time burden associated with participation
            and a potential breach of confidentiality or privacy; these risks
            will be minimized by storing data in secure Stanford-approved
            systems, limiting access to authorized study personnel, and
            reporting results only in aggregate or de-identified form. You may
            not receive any direct benefit from participating in this study;
            however, the information learned may help improve future clinical
            research methods and understanding of perioperative care. We cannot
            and do not guarantee or promise that you will receive any benefits
            from this study. Your decision whether or not to participate in this
            study will not affect your employment or medical care.
          </p>

          <p>
            <span className="font-semibold">TIME INVOLVEMENT:</span> Your
            participation in this study is expected to take approximately
            4–12.5 hours total. Study tasks may be completed in multiple
            sessions over the course of the study. Each participant will be
            assigned approximately 25 cases, and each case is expected to take
            about 10–30 minutes depending on case complexity.
          </p>

          <p>
            If you do not complete all assigned cases, you will be compensated
            for each completed annotated case that you submit.
          </p>

          <p>
            <span className="font-semibold">PAYMENTS:</span> You will receive
            payment for your participation in this study. Compensation will be
            provided for time spent completing study-related tasks (e.g.,
            annotation of perioperative data segments) with 50$ per case.
            Payment will be processed according to Stanford University policies.
          </p>

          <p>
            Payments may only be made to U.S. citizens, resident non-citizens,
            and those who are in a status that allows them to receive a taxable
            payment from a U.S. payer. You may need to provide your social
            security number to receive payment.
          </p>

          <p>
            Payments you receive for participating in research are generally
            considered taxable income. If the total amount you receive from
            Stanford for research participation in a calendar year is $2,000 or
            more, Stanford is required to report these payments to the Internal
            Revenue Service (IRS) and may issue you an IRS tax form.
          </p>

          <p>
            If the total amount you receive is less than $2,000, a tax form may
            not be issued. However, you are still responsible for reporting all
            taxable income on your tax return.
          </p>

          <p>
            <span className="font-semibold">PARTICIPANT’S RIGHTS:</span> If you
            have read this form and have decided to participate in this project,
            please understand your participation is voluntary and you have the
            right to withdraw your consent or discontinue participation at any
            time without penalty or loss of benefits to which you are otherwise
            entitled. The results of this research study may be presented at
            scientific or professional meetings or published in scientific
            journals. However, your identity will not be disclosed. You have the
            right to refuse to answer particular questions.
          </p>

          <p>
            <span className="font-semibold">CONTACT INFORMATION:</span>
          </p>

          <p>
            <span className="font-semibold">
              Questions, Concerns, or Complaints:
            </span>{" "}
            If you have any questions, concerns or complaints about this
            research study, its procedures, risks and benefits, or alternative
            courses of treatment, you should ask the Protocol Director,
            Weijieying Ren. You may contact them now or later at
            wjyren@stanford.edu.
          </p>

          <p>
            <span className="font-semibold">Injury Notification:</span> If you
            feel you have been hurt by being a part of this study, please
            contact the Protocol Director, Weijieying Ren at
            wjyren@stanford.edu.
          </p>

          <p>
            <span className="font-semibold">Independent Contact:</span> If you
            are not satisfied with how this study is being conducted, or if you
            have any concerns, complaints, or general questions about the
            research or your rights as a participant, please contact the
            Stanford Institutional Review Board (IRB) to speak to someone
            independent of the research team at 650-723-5244 or toll free at
            1-866-680-2906. You can also write to the Stanford IRB at
            irbeducation@stanford.edu.
          </p>

          <p>Please print a copy of this page for your records.</p>

          <p>
            If you agree to participate in this research, please finish
            case-level data annotation and submit it. You will only get
            case-level payment after you finish and submit the annotation tasks.
          </p>
        </div>

        <div className="mt-3 text-xs text-gray-600">
          {hasScrolledToBottom ? (
            <span className="text-green-700 font-medium">
              ✓ You have reached the end of the consent letter.
            </span>
          ) : (
            <span>
              Please scroll to the bottom of the consent letter before
              continuing.
            </span>
          )}
        </div>

        <div className="flex items-start space-x-3 mt-6">
          <input
            id="consent"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300"
            checked={hasCheckedConsent}
            onChange={(e) => setHasCheckedConsent(e.target.checked)}
            disabled={!hasScrolledToBottom}
          />
          <Label htmlFor="consent" className="text-sm leading-6">
            I have read the consent information above and I want to continue.
          </Label>
        </div>

        {!hasScrolledToBottom && (
          <p className="mt-2 text-xs text-amber-700">
            You must scroll to the bottom of the consent letter before checking
            the box.
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={() => router.push("/")}>
            Back
          </Button>
          <Button onClick={handleAccept} disabled={!canContinue}>
            Accept and Continue
          </Button>
        </div>
      </div>
    </main>
  );
}