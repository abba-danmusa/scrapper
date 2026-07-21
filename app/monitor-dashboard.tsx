"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Classification = "Internal - Not for Publication" | "Restricted" | "Public Draft";
type Priority = "Core" | "Useful" | "Specialist";
type SourceType = "API" | "Dataset" | "Official" | "RSS" | "News";
type Confidence = "High" | "Medium" | "Low";
type IngestionStatus = "Queued" | "Processed" | "Needs Review" | "Approved" | "Rejected";
type ReportSection =
  | "Context Overview"
  | "Regional Situation Overview"
  | "Multisectoral Analysis"
  | "Access Constraints"
  | "Government and Humanitarian Response"
  | "Outlook / Watchpoints";

type ReportParameters = {
  title: string;
  startDate: string;
  endDate: string;
  classification: Classification;
  subjects: string[];
  regions: string[];
};

type Source = {
  id: number;
  name: string;
  type: SourceType;
  coverage: string;
  priority: Priority;
  enabled: boolean;
};

type Article = {
  id: number;
  title: string;
  source: string;
  url: string;
  date: string;
  region: string;
  subject: string;
  confidence: Confidence;
  status: IngestionStatus;
  extractedSummary?: string;
  extractedFacts?: string[];
  reportSection?: ReportSection;
  processedAt?: string;
  reviewerNote?: string;
};

type WorkspaceState = {
  parameters: ReportParameters;
  sources: Source[];
  articles: Article[];
};

type IngestedArticle = Pick<Article, "title" | "source" | "url" | "date" | "region" | "subject">;

const allSubjects = [
  "Economy",
  "Security",
  "Nutrition",
  "Health",
  "Food Security",
  "WASH",
  "Government Response",
  "Humanitarian Response",
  "Education",
  "Shelter / NFI",
  "Access Constraints",
];

const allRegions = [
  "National Overview",
  "NE Region",
  "NW Region",
  "North Central",
  "Borno",
  "Adamawa",
  "Yobe",
  "Zamfara",
  "Katsina",
  "Sokoto",
  "Kaduna",
  "Kebbi",
];

const initialParameters: ReportParameters = {
  title: "Weekly Situation Update - Northern Nigeria",
  startDate: "2026-06-01",
  endDate: "2026-06-18",
  classification: "Internal - Not for Publication",
  subjects: [
    "Economy",
    "Security",
    "Nutrition",
    "Health",
    "Food Security",
    "WASH",
    "Government Response",
    "Humanitarian Response",
  ],
  regions: ["National Overview", "NE Region", "NW Region"],
};

const initialSources: Source[] = [
  {
    id: 1,
    name: "ReliefWeb",
    type: "API",
    coverage: "Humanitarian reports, UN and NGO updates",
    priority: "Core",
    enabled: true,
  },
  {
    id: 2,
    name: "ACLED",
    type: "Dataset",
    coverage: "Conflict events, actors, fatalities, locations",
    priority: "Core",
    enabled: true,
  },
  {
    id: 3,
    name: "OCHA",
    type: "Official",
    coverage: "Coordination updates and access constraints",
    priority: "Core",
    enabled: true,
  },
  {
    id: 4,
    name: "UNICEF",
    type: "Official",
    coverage: "Health, nutrition, WASH, children, education",
    priority: "Core",
    enabled: true,
  },
  {
    id: 5,
    name: "WHO",
    type: "Official",
    coverage: "Disease outbreaks and health response",
    priority: "Useful",
    enabled: true,
  },
  {
    id: 6,
    name: "UNHCR",
    type: "Official",
    coverage: "Displacement, shelter, protection",
    priority: "Useful",
    enabled: true,
  },
  {
    id: 7,
    name: "Daily Trust",
    type: "News",
    coverage: "Northern Nigeria local reporting",
    priority: "Core",
    enabled: true,
  },
  {
    id: 8,
    name: "HumAngle",
    type: "News",
    coverage: "Conflict, humanitarian, and accountability reporting",
    priority: "Specialist",
    enabled: true,
  },
];

const initialArticles: Article[] = [];

const reportSections = [
  "Executive Summary",
  "Key Developments",
  "Context Overview",
  "Regional Situation Overview",
  "Multisectoral Analysis",
  "Access Constraints",
  "Government and Humanitarian Response",
  "Outlook / Watchpoints",
  "Source Confidence Notes",
  "Source List",
];

const assignableReportSections: ReportSection[] = [
  "Context Overview",
  "Regional Situation Overview",
  "Multisectoral Analysis",
  "Access Constraints",
  "Government and Humanitarian Response",
  "Outlook / Watchpoints",
];

const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const workspaceStorageKey = "northern-nigeria-situation-monitor:v1";
const scraperApiBaseUrl =
  process.env.NEXT_PUBLIC_SCRAPER_API_URL || "http://localhost:4000";

const emptySourceForm: Omit<Source, "id" | "enabled"> = {
  name: "",
  type: "News",
  coverage: "",
  priority: "Useful",
};

const emptyArticleForm: Omit<Article, "id" | "confidence" | "status"> = {
  title: "",
  source: "ReliefWeb",
  url: "",
  date: new Date().toISOString().slice(0, 10),
  region: "NE Region",
  subject: "Security",
};

function getConfidenceForSource(source?: Source): Confidence {
  if (!source) {
    return "Low";
  }

  if (source.priority === "Core" && ["API", "Dataset", "Official"].includes(source.type)) {
    return "High";
  }

  if (source.priority === "Core" || source.type === "Official") {
    return "Medium";
  }

  return "Low";
}

function createExtractedFacts(article: Article) {
  return [
    `Date: ${formatDate(article.date)}`,
    `Location scope: ${article.region}`,
    `Subject tag: ${article.subject}`,
    `Source: ${article.source}`,
  ];
}

function formatDate(date: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${date}T00:00:00`));
  } catch {
    return date;
  }
}

function createExtractedSummary(article: Article) {
  return `${article.title}. The item is relevant to ${article.region} and has been tagged under ${article.subject.toLowerCase()} for inclusion in the weekly situation update.`;
}

function createSafeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readStoredWorkspace() {
  if (typeof window === "undefined") {
    return null;
  }

  const savedWorkspace = localStorage.getItem(workspaceStorageKey);

  if (!savedWorkspace) {
    return null;
  }

  try {
    return JSON.parse(savedWorkspace) as WorkspaceState;
  } catch {
    localStorage.removeItem(workspaceStorageKey);
    return null;
  }
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const styles = {
    High: "bg-emerald-100 text-emerald-800",
    Medium: "bg-amber-100 text-amber-800",
    Low: "bg-rose-100 text-rose-800",
  };

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${styles[confidence]}`}>
      {confidence}
    </span>
  );
}

function StatusBadge({ status }: { status: IngestionStatus }) {
  const styles = {
    Queued: "bg-zinc-100 text-zinc-700",
    Processed: "bg-indigo-100 text-indigo-800",
    "Needs Review": "bg-sky-100 text-sky-800",
    Approved: "bg-emerald-100 text-emerald-800",
    Rejected: "bg-rose-100 text-rose-800",
  };

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function MonitorDashboard() {
  const [parameters, setParameters] = useState(initialParameters);
  const [sources, setSources] = useState(initialSources);
  const [articles, setArticles] = useState(initialArticles);
  const [sourceForm, setSourceForm] = useState(emptySourceForm);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [articleForm, setArticleForm] = useState(emptyArticleForm);
  const [isHydrated, setIsHydrated] = useState(false);
  const [ingestionMessage, setIngestionMessage] = useState("Ready to ingest source material.");
  const [isIngesting, setIsIngesting] = useState(false);

  useEffect(() => {
    const savedWorkspace = localStorage.getItem(workspaceStorageKey);

    if (savedWorkspace) {
      try {
        const parsedWorkspace = JSON.parse(savedWorkspace) as WorkspaceState;
        setParameters(parsedWorkspace.parameters ?? initialParameters);
        setSources(parsedWorkspace.sources ?? initialSources);
        setArticles(parsedWorkspace.articles ?? initialArticles);
      } catch {
        localStorage.removeItem(workspaceStorageKey);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const workspace: WorkspaceState = {
      parameters,
      sources,
      articles,
    };

    localStorage.setItem(workspaceStorageKey, JSON.stringify(workspace));
  }, [articles, isHydrated, parameters, sources]);

  const enabledSources = sources.filter((source) => source.enabled);
  const approvedArticles = articles.filter((article) => article.status === "Approved");

  const filteredArticles = useMemo(
    () =>
      articles.filter(
        (article) =>
          parameters.subjects.includes(article.subject) &&
          parameters.regions.includes(article.region) &&
          enabledSources.some((source) => source.name === article.source),
      ),
    [articles, enabledSources, parameters.regions, parameters.subjects],
  );

  const processingQueue = filteredArticles.filter((article) => article.status === "Queued");
  const reviewQueue = filteredArticles.filter(
    (article) => article.status === "Processed" || article.status === "Needs Review",
  );

  const reportDraft = useMemo(() => {
    const grouped = reportSections.map((section) => ({
      section,
      items: approvedArticles.filter((article) => article.reportSection === section),
    }));

    return grouped.filter((group) => group.items.length > 0);
  }, [approvedArticles]);

  function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceForm.name.trim() || !sourceForm.coverage.trim()) {
      return;
    }

    if (editingSourceId) {
      setSources((currentSources) =>
        currentSources.map((source) =>
          source.id === editingSourceId ? { ...source, ...sourceForm } : source,
        ),
      );
      setEditingSourceId(null);
    } else {
      setSources((currentSources) => [
        ...currentSources,
        {
          ...sourceForm,
          id: Math.max(0, ...currentSources.map((source) => source.id)) + 1,
          enabled: true,
        },
      ]);
    }

    setSourceForm(emptySourceForm);
  }

  function editSource(source: Source) {
    setEditingSourceId(source.id);
    setSourceForm({
      name: source.name,
      type: source.type,
      coverage: source.coverage,
      priority: source.priority,
    });
  }

  function deleteSource(sourceId: number) {
    setSources((currentSources) => currentSources.filter((source) => source.id !== sourceId));
  }

  function toggleSource(sourceId: number) {
    setSources((currentSources) =>
      currentSources.map((source) =>
        source.id === sourceId ? { ...source, enabled: !source.enabled } : source,
      ),
    );
  }

  function addArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!articleForm.title.trim() || !articleForm.url.trim()) {
      return;
    }

    setArticles((currentArticles) => [
      {
        ...articleForm,
        id: Math.max(0, ...currentArticles.map((article) => article.id)) + 1,
        confidence: "Medium",
        status: "Queued",
      },
      ...currentArticles,
    ]);
    setArticleForm({
      ...emptyArticleForm,
      source: enabledSources[0]?.name ?? "ReliefWeb",
      region: parameters.regions[0] ?? "NE Region",
      subject: parameters.subjects[0] ?? "Security",
    });
  }

  function simulateIngestionRun() {
    const sourceName = enabledSources[0]?.name ?? "ReliefWeb";
    const region = parameters.regions[0] ?? "National Overview";
    const subject = parameters.subjects[0] ?? "Security";

    setArticles((currentArticles) => [
      {
        id: Math.max(0, ...currentArticles.map((article) => article.id)) + 1,
        title: `${sourceName} monitoring item for ${region}`,
        source: sourceName,
        url: "https://example.org/source-monitoring-item",
        date: parameters.endDate,
        region,
        subject,
        confidence: "Low",
        status: "Queued",
      },
      ...currentArticles,
    ]);
  }

  function processArticle(articleId: number) {
    setArticles((currentArticles) =>
      currentArticles.map((article) => {
        if (article.id !== articleId) {
          return article;
        }

        const source = sources.find((candidate) => candidate.name === article.source);

        return {
          ...article,
          confidence: getConfidenceForSource(source),
          status: "Processed",
          extractedSummary: article.extractedSummary ?? createExtractedSummary(article),
          extractedFacts: article.extractedFacts ?? createExtractedFacts(article),
          reportSection: article.reportSection ?? getReportSection(article.subject),
          processedAt: parameters.endDate,
        };
      }),
    );
  }

  function processQueuedArticles() {
    setArticles((currentArticles) =>
      currentArticles.map((article) => {
        if (article.status !== "Queued") {
          return article;
        }

        const source = sources.find((candidate) => candidate.name === article.source);

        return {
          ...article,
          confidence: getConfidenceForSource(source),
          status: "Processed",
          extractedSummary: article.extractedSummary ?? createExtractedSummary(article),
          extractedFacts: article.extractedFacts ?? createExtractedFacts(article),
          reportSection: article.reportSection ?? getReportSection(article.subject),
          processedAt: parameters.endDate,
        };
      }),
    );
  }

  function updateArticleExtraction(
    articleId: number,
    field: "extractedSummary" | "reviewerNote" | "reportSection" | "confidence",
    value: string,
  ) {
    setArticles((currentArticles) =>
      currentArticles.map((article) =>
        article.id === articleId ? { ...article, [field]: value } : article,
      ),
    );
  }

  function updateArticleStatus(articleId: number, status: IngestionStatus) {
    setArticles((currentArticles) =>
      currentArticles.map((article) =>
        article.id === articleId
          ? {
              ...article,
              status,
              extractedSummary:
                article.extractedSummary ?? createExtractedSummary(article),
              extractedFacts: article.extractedFacts ?? createExtractedFacts(article),
              reportSection: article.reportSection ?? getReportSection(article.subject),
            }
          : article,
      ),
    );
  }

  function resetWorkspace() {
    setParameters(initialParameters);
    setSources(initialSources);
    setArticles(initialArticles);
    localStorage.removeItem(workspaceStorageKey);
    setIngestionMessage("Workspace reset to the default sample data.");
  }

  async function ingestReliefWebReports() {
    setIsIngesting(true);
    setIngestionMessage(
      "Fetching source material from the scraper pipeline for the selected period and filters...",
    );

    try {
      const response = await fetch(`${scraperApiBaseUrl}/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: parameters.startDate,
          endDate: parameters.endDate,
          subjects: parameters.subjects,
          regions: parameters.regions,
          enabledSources: sources.filter((source) => source.enabled).map((source) => source.name),
        }),
      });

      const payload = (await response.json()) as {
        articles?: IngestedArticle[];
        error?: string;
        count?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Ingestion failed.");
      }

      const incomingArticles = payload.articles ?? [];

      setArticles((currentArticles) => {
        const existingKeys = new Set(
          currentArticles.map((article) => `${article.url}|${article.title}`),
        );
        const nextId = Math.max(0, ...currentArticles.map((article) => article.id)) + 1;
        const newArticles = incomingArticles
          .filter((article) => !existingKeys.has(`${article.url}|${article.title}`))
          .map((article, index): Article => ({
            ...article,
            id: nextId + index,
            confidence: (article as Partial<Article>).confidence ?? "High",
            status: "Queued",
          }));

        return [...newArticles, ...currentArticles];
      });

      setIngestionMessage(
        `${payload.count ?? incomingArticles.length} item${
          (payload.count ?? incomingArticles.length) === 1 ? "" : "s"
        } queued from the ingestion pipeline. Duplicate URLs were skipped.`,
      );
    } catch (error) {
      setIngestionMessage(
        error instanceof Error
          ? error.message
          : "Ingestion failed. Check that the scraper server is running.",
      );
    } finally {
      setIsIngesting(false);
    }
  }

  function buildReportHtml() {
    const summaryText =
      approvedArticles.length === 0
        ? "No approved source items have been cleared for this report."
        : `During the reporting period, ${approvedArticles.length} approved source item${
            approvedArticles.length === 1 ? "" : "s"
          } were cleared for inclusion across ${
            new Set(approvedArticles.map((article) => article.region)).size
          } area scope${approvedArticles.length === 1 ? "" : "s"}.`;

    const groupedSections = reportDraft
      .map(
        (group, groupIndex) => `
          <h2>${romanNumerals[groupIndex + 1]}. ${escapeHtml(group.section)}</h2>
          <ul>
            ${group.items
              .map(
                (article) => `
                  <li>
                    ${escapeHtml(article.extractedSummary ?? createExtractedSummary(article))}
                    <strong>Source: ${escapeHtml(article.source)}.</strong>
                  </li>
                `,
              )
              .join("")}
          </ul>
        `,
      )
      .join("");

    const confidenceNotes = approvedArticles
      .map(
        (article) => `
          <li>
            ${escapeHtml(article.source)}: ${escapeHtml(article.confidence)} confidence.
            ${escapeHtml(article.reviewerNote || "No additional review note recorded.")}
          </li>
        `,
      )
      .join("");

    const sourceList = approvedArticles
      .map(
        (article) => `
          <li>
            ${escapeHtml(article.source)} - ${escapeHtml(article.title)}
            (${escapeHtml(article.url)})
          </li>
        `,
      )
      .join("");

    return `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(parameters.title)}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #18181b; line-height: 1.55; }
            h1 { font-size: 20px; margin-bottom: 4px; text-transform: uppercase; }
            h2 { font-size: 15px; margin-top: 22px; margin-bottom: 8px; }
            p, li { font-size: 12px; }
            ul { padding-left: 18px; }
            .meta { color: #52525b; margin: 0; }
            .header { border-bottom: 1px solid #d4d4d8; padding-bottom: 12px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${escapeHtml(parameters.title)}</h1>
            <p class="meta">Reporting Period: ${escapeHtml(
              formatDate(parameters.startDate),
            )} - ${escapeHtml(formatDate(parameters.endDate))}</p>
            <p class="meta">Classification: ${escapeHtml(parameters.classification)}</p>
          </div>

          <h2>I. Executive Summary</h2>
          <p>${escapeHtml(summaryText)}</p>
          ${groupedSections}

          <h2>Source Confidence Notes</h2>
          <ul>${confidenceNotes || "<li>No approved source confidence notes.</li>"}</ul>

          <h2>Source List</h2>
          <ul>${sourceList || "<li>No approved sources.</li>"}</ul>
        </body>
      </html>`;
  }

  function exportWorkspaceJson() {
    const workspace: WorkspaceState = {
      parameters,
      sources,
      articles,
    };

    downloadFile(
      `${createSafeFilename(parameters.title)}-workspace.json`,
      JSON.stringify(workspace, null, 2),
      "application/json",
    );
  }

  function exportWordDocument() {
    downloadFile(
      `${createSafeFilename(parameters.title)}.doc`,
      buildReportHtml(),
      "application/msword;charset=utf-8",
    );
  }

  function printReportPdf() {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!reportWindow) {
      return;
    }

    reportWindow.document.write(buildReportHtml());
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Northern Nigeria Situation Monitor
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Build the report from parameters, approved sources, and reviewed articles
            </h1>
          </div>
          <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-4 lg:w-[720px]">
            <div className="border border-zinc-200 bg-zinc-50 p-3">
              <span className="block font-semibold text-zinc-950">Period</span>
              {formatDate(parameters.startDate)} - {formatDate(parameters.endDate)}
            </div>
            <div className="border border-zinc-200 bg-zinc-50 p-3">
              <span className="block font-semibold text-zinc-950">Sources</span>
              {enabledSources.length} active
            </div>
            <div className="border border-zinc-200 bg-zinc-50 p-3">
              <span className="block font-semibold text-zinc-950">Approved</span>
              {approvedArticles.length} article inputs
            </div>
            <div className="border border-zinc-200 bg-zinc-50 p-3">
              <span className="block font-semibold text-zinc-950">Persistence</span>
              {isHydrated ? "Autosaved" : "Loading"}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <section className="border border-zinc-200 bg-white p-4">
            <h2 className="text-lg font-semibold">7. Persistence</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Workspace changes are saved in this browser automatically.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                onClick={exportWorkspaceJson}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
              >
                Export workspace JSON
              </button>
              <button
                onClick={resetWorkspace}
                className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700"
              >
                Reset workspace
              </button>
            </div>
          </section>

          <section className="border border-zinc-200 bg-white p-4">
            <h2 className="text-lg font-semibold">1. Report Parameters</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Set the reporting frame before collecting or filtering articles.
            </p>

            <div className="mt-4 space-y-4">
              <label className="block text-sm font-semibold">
                Report title
                <input
                  value={parameters.title}
                  onChange={(event) =>
                    setParameters({ ...parameters, title: event.target.value })
                  }
                  className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-semibold">
                  Start
                  <input
                    type="date"
                    value={parameters.startDate}
                    onChange={(event) =>
                      setParameters({ ...parameters, startDate: event.target.value })
                    }
                    className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
                  />
                </label>
                <label className="block text-sm font-semibold">
                  End
                  <input
                    type="date"
                    value={parameters.endDate}
                    onChange={(event) =>
                      setParameters({ ...parameters, endDate: event.target.value })
                    }
                    className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
                  />
                </label>
              </div>

              <label className="block text-sm font-semibold">
                Classification
                <select
                  value={parameters.classification}
                  onChange={(event) =>
                    setParameters({
                      ...parameters,
                      classification: event.target.value as Classification,
                    })
                  }
                  className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
                >
                  <option>Internal - Not for Publication</option>
                  <option>Restricted</option>
                  <option>Public Draft</option>
                </select>
              </label>
            </div>
          </section>

          <section className="border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Subjects
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {allSubjects.map((subject) => {
                const active = parameters.subjects.includes(subject);
                return (
                  <button
                    key={subject}
                    onClick={() =>
                      setParameters({
                        ...parameters,
                        subjects: toggleListValue(parameters.subjects, subject),
                      })
                    }
                    className={`rounded-md border px-2.5 py-1 text-sm ${
                      active
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700"
                    }`}
                  >
                    {subject}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Regions
            </h3>
            <div className="mt-3 grid gap-2">
              {allRegions.map((region) => {
                const active = parameters.regions.includes(region);
                return (
                  <button
                    key={region}
                    onClick={() =>
                      setParameters({
                        ...parameters,
                        regions: toggleListValue(parameters.regions, region),
                      })
                    }
                    className={`flex items-center justify-between border px-3 py-2 text-left text-sm ${
                      active
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700"
                    }`}
                  >
                    <span>{region}</span>
                    <span className="text-xs">{active ? "active" : "off"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <div className="space-y-5">
          <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="border border-zinc-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">2. Source Registry</h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    Add, edit, enable, or remove approved collection sources.
                  </p>
                </div>
                <span className="w-fit rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                  {sources.length} configured
                </span>
              </div>

              <form onSubmit={saveSource} className="mt-4 grid gap-3 border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-4">
                <input
                  placeholder="Source name"
                  value={sourceForm.name}
                  onChange={(event) =>
                    setSourceForm({ ...sourceForm, name: event.target.value })
                  }
                  className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
                />
                <select
                  value={sourceForm.type}
                  onChange={(event) =>
                    setSourceForm({ ...sourceForm, type: event.target.value as SourceType })
                  }
                  className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
                >
                  <option>API</option>
                  <option>Dataset</option>
                  <option>Official</option>
                  <option>RSS</option>
                  <option>News</option>
                </select>
                <select
                  value={sourceForm.priority}
                  onChange={(event) =>
                    setSourceForm({ ...sourceForm, priority: event.target.value as Priority })
                  }
                  className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
                >
                  <option>Core</option>
                  <option>Useful</option>
                  <option>Specialist</option>
                </select>
                <button className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">
                  {editingSourceId ? "Update source" : "Add source"}
                </button>
                <input
                  placeholder="Coverage notes"
                  value={sourceForm.coverage}
                  onChange={(event) =>
                    setSourceForm({ ...sourceForm, coverage: event.target.value })
                  }
                  className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950 md:col-span-4"
                />
              </form>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase tracking-[0.12em] text-zinc-500">
                      <th className="px-3 py-2 font-semibold">Source</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Coverage</th>
                      <th className="px-3 py-2 font-semibold">Priority</th>
                      <th className="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((source) => (
                      <tr key={source.id} className="border-b border-zinc-100">
                        <td className="px-3 py-3 font-semibold">
                          <span className={source.enabled ? "" : "text-zinc-400"}>
                            {source.name}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-zinc-600">{source.type}</td>
                        <td className="px-3 py-3 text-zinc-600">{source.coverage}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                            {source.priority}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => toggleSource(source.id)}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold"
                            >
                              {source.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              onClick={() => editSource(source)}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteSource(source.id)}
                              className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-zinc-200 bg-white p-4">
              <h2 className="text-lg font-semibold">Report Draft Shape</h2>
              <div className="mt-4 border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p className="font-semibold">{parameters.title.toUpperCase()}</p>
                <p className="mt-2 text-zinc-600">
                  Reporting Period: {formatDate(parameters.startDate)} -{" "}
                  {formatDate(parameters.endDate)}
                </p>
                <p className="text-zinc-600">Classification: {parameters.classification}</p>
              </div>
              <ol className="mt-4 space-y-2 text-sm text-zinc-700">
                {reportSections.map((section, index) => (
                  <li key={section} className="flex gap-3 border-b border-zinc-100 pb-2">
                    <span className="w-6 shrink-0 font-semibold text-zinc-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{section}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">3. Article Ingestion Workspace</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Queue source material before extraction, deduplication, and analyst review.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={simulateIngestionRun}
                  className="w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold"
                >
                  Run source scan
                </button>
                <button
                  onClick={ingestReliefWebReports}
                  disabled={isIngesting}
                  className="w-fit rounded-md border border-zinc-950 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                >
                  {isIngesting ? "Ingesting ReliefWeb" : "Ingest ReliefWeb"}
                </button>
                <button
                  onClick={processQueuedArticles}
                  className="w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  Process queued ({processingQueue.length})
                </button>
              </div>
            </div>

            <div className="mt-4 border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              {ingestionMessage}
            </div>

            <form onSubmit={addArticle} className="mt-4 grid gap-3 border border-zinc-200 bg-zinc-50 p-3 lg:grid-cols-6">
              <input
                placeholder="Article or report title"
                value={articleForm.title}
                onChange={(event) =>
                  setArticleForm({ ...articleForm, title: event.target.value })
                }
                className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950 lg:col-span-2"
              />
              <select
                value={articleForm.source}
                onChange={(event) =>
                  setArticleForm({ ...articleForm, source: event.target.value })
                }
                className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
              >
                {enabledSources.map((source) => (
                  <option key={source.id}>{source.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={articleForm.date}
                onChange={(event) =>
                  setArticleForm({ ...articleForm, date: event.target.value })
                }
                className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
              />
              <select
                value={articleForm.region}
                onChange={(event) =>
                  setArticleForm({ ...articleForm, region: event.target.value })
                }
                className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
              >
                {parameters.regions.map((region) => (
                  <option key={region}>{region}</option>
                ))}
              </select>
              <select
                value={articleForm.subject}
                onChange={(event) =>
                  setArticleForm({ ...articleForm, subject: event.target.value })
                }
                className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
              >
                {parameters.subjects.map((subject) => (
                  <option key={subject}>{subject}</option>
                ))}
              </select>
              <input
                placeholder="Source URL"
                value={articleForm.url}
                onChange={(event) =>
                  setArticleForm({ ...articleForm, url: event.target.value })
                }
                className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950 lg:col-span-5"
              />
              <button className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">
                Queue article
              </button>
            </form>

            <div className="mt-4 grid gap-3">
              {filteredArticles.map((article) => (
                <article key={article.id} className="border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-zinc-500">
                        <span>{formatDate(article.date)}</span>
                        <span>{article.region}</span>
                        <span>{article.subject}</span>
                        <span>{article.source}</span>
                      </div>
                      <h3 className="mt-2 font-semibold">{article.title}</h3>
                      <a
                        href={article.url}
                        className="mt-1 block max-w-3xl truncate text-sm text-zinc-600 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {article.url}
                      </a>
                      {article.extractedSummary ? (
                        <p className="mt-3 max-w-4xl border-l-2 border-zinc-300 pl-3 text-sm leading-6 text-zinc-700">
                          {article.extractedSummary}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <ConfidenceBadge confidence={article.confidence} />
                      <StatusBadge status={article.status} />
                      <button
                        onClick={() => processArticle(article.id)}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                      >
                        Process
                      </button>
                      <button
                        onClick={() => updateArticleStatus(article.id, "Needs Review")}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => updateArticleStatus(article.id, "Approved")}
                        className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <div className="border border-zinc-200 bg-white p-4">
              <h2 className="text-lg font-semibold">4. Article Processing</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Convert queued source material into structured report evidence.
              </p>
              <div className="mt-4 grid gap-3">
                <div className="border border-zinc-200 bg-zinc-50 p-3">
                  <span className="block text-2xl font-semibold">{processingQueue.length}</span>
                  <span className="text-sm text-zinc-600">Queued for extraction</span>
                </div>
                <div className="border border-zinc-200 bg-zinc-50 p-3">
                  <span className="block text-2xl font-semibold">{reviewQueue.length}</span>
                  <span className="text-sm text-zinc-600">Awaiting analyst review</span>
                </div>
                <div className="border border-zinc-200 bg-zinc-50 p-3">
                  <span className="block text-2xl font-semibold">{approvedArticles.length}</span>
                  <span className="text-sm text-zinc-600">Approved for report</span>
                </div>
              </div>
              <button
                onClick={processQueuedArticles}
                className="mt-4 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Process all queued material
              </button>
            </div>

            <div className="border border-zinc-200 bg-white p-4">
              <h2 className="text-lg font-semibold">5. Analyst Review</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Edit extracted language, confirm confidence, and approve only sourced claims.
              </p>

              <div className="mt-4 grid gap-3">
                {reviewQueue.length === 0 ? (
                  <div className="border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                    No processed items are waiting for review.
                  </div>
                ) : null}

                {reviewQueue.map((article) => (
                  <article key={`review-${article.id}`} className="border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold text-zinc-500">
                          <span>{formatDate(article.date)}</span>
                          <span>{article.region}</span>
                          <span>{article.subject}</span>
                          <span>{article.source}</span>
                        </div>
                        <h3 className="mt-2 font-semibold">{article.title}</h3>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <ConfidenceBadge confidence={article.confidence} />
                        <StatusBadge status={article.status} />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]">
                      <label className="block text-sm font-semibold">
                        Extracted report language
                        <textarea
                          value={article.extractedSummary ?? ""}
                          onChange={(event) =>
                            updateArticleExtraction(
                              article.id,
                              "extractedSummary",
                              event.target.value,
                            )
                          }
                          className="mt-1 min-h-28 w-full border border-zinc-300 bg-white px-3 py-2 font-normal leading-6 outline-none focus:border-zinc-950"
                        />
                      </label>

                      <div className="space-y-3">
                        <label className="block text-sm font-semibold">
                          Report section
                          <select
                            value={article.reportSection ?? getReportSection(article.subject)}
                            onChange={(event) =>
                              updateArticleExtraction(
                                article.id,
                                "reportSection",
                                event.target.value,
                              )
                            }
                            className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
                          >
                            {assignableReportSections.map((section) => (
                              <option key={section}>{section}</option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-sm font-semibold">
                          Confidence
                          <select
                            value={article.confidence}
                            onChange={(event) =>
                              updateArticleExtraction(
                                article.id,
                                "confidence",
                                event.target.value,
                              )
                            }
                            className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
                          >
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <label className="mt-3 block text-sm font-semibold">
                      Review note
                      <input
                        value={article.reviewerNote ?? ""}
                        onChange={(event) =>
                          updateArticleExtraction(
                            article.id,
                            "reviewerNote",
                            event.target.value,
                          )
                        }
                        placeholder="Optional note on verification, conflicting figures, or wording"
                        className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => updateArticleStatus(article.id, "Approved")}
                        className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white"
                      >
                        Approve for report
                      </button>
                      <button
                        onClick={() => updateArticleStatus(article.id, "Rejected")}
                        className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">6. Report Generator</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Approved evidence is assembled into the weekly situation update structure.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={exportWordDocument}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                >
                  Download Word
                </button>
                <button
                  onClick={printReportPdf}
                  className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white"
                >
                  Print / Save PDF
                </button>
                <span className="w-fit rounded-md bg-zinc-100 px-2 py-2 text-xs font-semibold text-zinc-700">
                  {approvedArticles.length} approved source items
                </span>
              </div>
            </div>

            <div className="mt-4 border border-zinc-300 bg-[#fbfbf8] p-5">
              <div className="border-b border-zinc-200 pb-4">
                <h3 className="text-xl font-semibold">{parameters.title.toUpperCase()}</h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Reporting Period: {formatDate(parameters.startDate)} -{" "}
                  {formatDate(parameters.endDate)}
                </p>
                <p className="text-sm text-zinc-600">
                  Classification: {parameters.classification}
                </p>
              </div>

              {approvedArticles.length === 0 ? (
                <div className="mt-5 border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600">
                  Approve reviewed items to populate the report draft.
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <section>
                    <h4 className="font-semibold">I. Executive Summary</h4>
                    <p className="mt-2 text-sm leading-6 text-zinc-700">
                      During the reporting period, {approvedArticles.length} approved source
                      item{approvedArticles.length === 1 ? "" : "s"} were cleared for inclusion
                      across {new Set(approvedArticles.map((article) => article.region)).size} area
                      scope{approvedArticles.length === 1 ? "" : "s"}.
                    </p>
                  </section>

                  {reportDraft.map((group, groupIndex) => (
                    <section key={group.section}>
                      <h4 className="font-semibold">
                        {romanNumerals[groupIndex + 1]}. {group.section}
                      </h4>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-zinc-700">
                        {group.items.map((article) => (
                          <li key={`draft-${article.id}`}>
                            {article.extractedSummary}{" "}
                            <span className="font-semibold text-zinc-950">
                              Source: {article.source}.
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  <section>
                    <h4 className="font-semibold">Source Confidence Notes</h4>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-zinc-700">
                      {approvedArticles.map((article) => (
                        <li key={`confidence-${article.id}`}>
                          {article.source}: {article.confidence} confidence.{" "}
                          {article.reviewerNote || "No additional review note recorded."}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
