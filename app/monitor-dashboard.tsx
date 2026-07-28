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
  backendSupported?: boolean;
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

type WorkspaceStatus = "draft" | "published";

type WorkspaceState = {
  status?: WorkspaceStatus;
  publishedAt?: string | null;
  parameters: ReportParameters;
  sources: Source[];
  articles: Article[];
};

type SourceHealthEntry = {
  name: string;
  ok: boolean;
  count: number;
  error: string | null;
  checkedAt: string | null;
};

type RunHistoryEntry = {
  runAt: string;
  count: number;
  sourceHealth: SourceHealthEntry[];
  lastErrors: Array<{ source: string; message: string }>;
};

type HealthStatus = {
  ok: boolean;
  service: string;
  snapshotCount: number;
  generatedAt: string | null;
  hasSnapshot: boolean;
  sourceHealth: SourceHealthEntry[];
  lastErrors: Array<{ source: string; message: string }>;
  lastRunAt: string | null;
  runHistory: RunHistoryEntry[];
  workspaceCount?: number;
  latestWorkspaceTitle?: string | null;
  latestWorkspaceStatus?: WorkspaceStatus | null;
  latestWorkspaceUpdatedAt?: string | null;
  mongo?: {
    configured: boolean;
    connected: boolean;
    message: string;
  };
  scheduler?: {
    enabled: boolean;
    running: boolean;
    intervalMinutes: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastError: string | null;
  };
};

type WorkspaceSummary = {
  id?: string;
  title?: string;
  status?: WorkspaceStatus;
  publishedAt?: string | null;
  updatedAt?: string | null;
  parameters?: ReportParameters;
  sources?: Source[];
  articles?: Article[];
};

type AcledTokenStatus = {
  ok: boolean;
  token?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
  } | null;
  error?: string | null;
};

type IngestedArticle = Pick<Article, "title" | "source" | "url" | "date" | "region" | "subject"> & {
  summary?: string;
  extractedFacts?: string[];
  confidence?: Confidence;
};

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

const supportedBackendSources: Source[] = [
  {
    id: 1,
    name: "ReliefWeb",
    type: "API",
    coverage: "Humanitarian reports, UN and NGO updates",
    priority: "Core",
    enabled: true,
    backendSupported: true,
  },
  {
    id: 2,
    name: "RSS",
    type: "RSS",
    coverage: "RSS feeds and vetted news sources",
    priority: "Core",
    enabled: true,
    backendSupported: true,
  },
  {
    id: 3,
    name: "HTML",
    type: "News",
    coverage: "HTML-based site discovery and article extraction",
    priority: "Core",
    enabled: true,
    backendSupported: true,
  },
  {
    id: 4,
    name: "ACLED",
    type: "Dataset",
    coverage: "Conflict events, actors, fatalities, locations",
    priority: "Core",
    enabled: true,
    backendSupported: true,
  },
];

const initialSources: Source[] = supportedBackendSources.map((source) => ({ ...source }));

const initialArticles: Article[] = [];

const reportSections: ReportSection[] = [
  "Context Overview",
  "Multisectoral Analysis",
  "Access Constraints",
  "Government and Humanitarian Response",
  "Outlook / Watchpoints",
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

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function getReportSection(subject: string): ReportSection {
  const normalizedSubject = subject.toLowerCase();

  if (normalizedSubject.includes("access") || normalizedSubject.includes("constraint")) {
    return "Access Constraints";
  }

  if (normalizedSubject.includes("response") || normalizedSubject.includes("government")) {
    return "Government and Humanitarian Response";
  }

  if (normalizedSubject.includes("nutrition") || normalizedSubject.includes("health")) {
    return "Multisectoral Analysis";
  }

  return "Context Overview";
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

function formatIngestResultMessage(
  payload: {
    count?: number;
    sourceHealth?: SourceHealthEntry[];
    lastErrors?: Array<{ source: string; message: string }>;
  },
  incomingArticles: IngestedArticle[],
  newArticleCount = incomingArticles.length,
  duplicateCount = 0,
) {
  const count = payload.count ?? incomingArticles.length;
  const actualNewCount = newArticleCount ?? Math.max(0, count);
  const duplicatesSkipped = duplicateCount ?? Math.max(0, count - actualNewCount);
  const errorCount = payload.lastErrors?.length ?? 0;

  if (actualNewCount > 0) {
    return `${actualNewCount} new, ${duplicatesSkipped} duplicate${duplicatesSkipped === 1 ? "" : "s"}, ${errorCount} error${errorCount === 1 ? "" : "s"}. ${actualNewCount === 1 ? "Article" : "Articles"} added to the workspace.`;
  }

  if (payload.lastErrors && payload.lastErrors.length > 0) {
    const failureSummary = payload.lastErrors
      .slice(0, 3)
      .map((entry) => `${entry.source}: ${entry.message}`)
      .join(" • ");

    return `${actualNewCount} new, ${duplicatesSkipped} duplicate${duplicatesSkipped === 1 ? "" : "s"}, ${errorCount} error${errorCount === 1 ? "" : "s"}. ${payload.lastErrors.length === 1 ? "Source issue" : "Source issues"}: ${failureSummary}`;
  }

  if (payload.sourceHealth && payload.sourceHealth.some((entry) => !entry.ok)) {
    return `${actualNewCount} new, ${duplicatesSkipped} duplicate${duplicatesSkipped === 1 ? "" : "s"}, ${errorCount} error${errorCount === 1 ? "" : "s"}. One or more sources reported errors.`;
  }

  if (count > 0) {
    return `${actualNewCount} new, ${duplicatesSkipped} duplicate${duplicatesSkipped === 1 ? "" : "s"}, ${errorCount} error${errorCount === 1 ? "" : "s"}. No new items were added to the workspace.`;
  }

  return "0 new, 0 duplicates, 0 errors. No new articles were returned by the ingestion pipeline.";
}

function hydrateStoredSource(source: Partial<Source>): Source {
  const backendSupported =
    typeof source.backendSupported === "boolean"
      ? source.backendSupported
      : supportedBackendSources.some((item) => item.name === source.name);

  return {
    id: typeof source.id === "number" ? source.id : 0,
    name: source.name ?? "Unknown Source",
    type: source.type ?? "News",
    coverage: source.coverage ?? "",
    priority: source.priority ?? "Useful",
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    backendSupported,
  };
}

function hydrateWorkspaceSources(rawSources: unknown): Source[] {
  const persistedSources = Array.isArray(rawSources)
    ? (rawSources as Array<Partial<Source>>).map((source) => hydrateStoredSource(source))
    : [];

  const mergedSources = [...persistedSources];
  supportedBackendSources.forEach((backendSource) => {
    const existingIndex = mergedSources.findIndex((item) => item.name === backendSource.name);
    if (existingIndex === -1) {
      mergedSources.push({
        ...backendSource,
        enabled: backendSource.enabled,
      });
    } else {
      mergedSources[existingIndex] = {
        ...backendSource,
        ...mergedSources[existingIndex],
        enabled: mergedSources[existingIndex].enabled,
      };
    }
  });

  return mergedSources;
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
  const [parameters, setParameters] = useState<ReportParameters>(initialParameters);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [restoredWorkspaceNotice, setRestoredWorkspaceNotice] = useState<string | null>(null);
  const [sourceForm, setSourceForm] = useState(emptySourceForm);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [articleForm, setArticleForm] = useState(emptyArticleForm);
  const [ingestionMessage, setIngestionMessage] = useState("Ready to ingest source material.");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("draft");
  const [workspacePublishedAt, setWorkspacePublishedAt] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>({
    ok: false,
    service: "scraper-server",
    snapshotCount: 0,
    generatedAt: null,
    hasSnapshot: false,
    sourceHealth: [],
    lastErrors: [],
    lastRunAt: null,
    runHistory: [],
  });
  const [healthMessage, setHealthMessage] = useState("Checking scraper health...");
  const [serverWorkspaces, setServerWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [acledTokenStatus, setAcledTokenStatus] = useState<AcledTokenStatus>({ ok: false, token: null });
  const [activeModal, setActiveModal] = useState<"workspace" | "health" | "draft" | null>(null);

  async function refreshHealthStatus() {
    try {
      const response = await fetch(`${scraperApiBaseUrl}/health`);
      const payload = (await response.json()) as Partial<HealthStatus> & { ok?: boolean };

      setHealthStatus({
        ok: response.ok && payload.ok === true,
        service: payload.service ?? "scraper-server",
        snapshotCount: typeof payload.snapshotCount === "number" ? payload.snapshotCount : 0,
        generatedAt: payload.generatedAt ?? null,
        hasSnapshot: payload.hasSnapshot === true,
        sourceHealth: Array.isArray(payload.sourceHealth) ? payload.sourceHealth : [],
        lastErrors: Array.isArray(payload.lastErrors) ? payload.lastErrors : [],
        lastRunAt: payload.lastRunAt ?? null,
        runHistory: Array.isArray(payload.runHistory) ? payload.runHistory : [],
        workspaceCount: typeof payload.workspaceCount === "number" ? payload.workspaceCount : undefined,
        latestWorkspaceTitle: payload.latestWorkspaceTitle ?? null,
        latestWorkspaceStatus: (payload.latestWorkspaceStatus as WorkspaceStatus | null | undefined) ?? null,
        latestWorkspaceUpdatedAt: payload.latestWorkspaceUpdatedAt ?? null,
        mongo: payload.mongo,
        scheduler: payload.scheduler,
      });
      setHealthMessage(
        response.ok
          ? `Connected to ${payload.  service ?? "scraper-server"}.`
          : "The scraper health endpoint returned an error.",
      );
    } catch {
      setHealthStatus((current) => ({ ...current, ok: false }));
      setHealthMessage("The scraper health endpoint is unavailable.");
    }
  }

  async function refreshServerWorkspaces() {
    try {
      const response = await fetch(`${scraperApiBaseUrl}/workspaces`);
      const payload = (await response.json()) as { workspaces?: WorkspaceSummary[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load workspace list.");
      }
      setServerWorkspaces(Array.isArray(payload.workspaces) ? payload.workspaces : []);
    } catch {
      setServerWorkspaces([]);
    }
  }

  async function refreshAcledAuthStatus() {
    try {
      const response = await fetch(`${scraperApiBaseUrl}/acled/token`);
      const payload = (await response.json()) as AcledTokenStatus & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No ACLED token is currently available.");
      }
      setAcledTokenStatus({ ok: true, token: payload.token ?? null });
    } catch {
      setAcledTokenStatus({ ok: false, token: null });
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWorkspaceFromServer("draft");
      void refreshHealthStatus();
      void refreshServerWorkspaces();
      void refreshAcledAuthStatus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const enabledSources = useMemo(
    () => sources.filter((source) => source.enabled),
    [sources],
  );
  const approvedArticles = articles.filter((article) => article.status === "Approved");
  const processingQueue = articles.filter((article) => article.status === "Queued");
  const reviewQueue = articles.filter(
    (article) => article.status === "Processed" || article.status === "Needs Review",
  );

  const workflowProgress = useMemo(() => {
    let progress = 0;

    if (parameters.title.trim()) {
      progress += 15;
    }
    if (parameters.startDate && parameters.endDate) {
      progress += 15;
    }
    if (enabledSources.length > 0) {
      progress += 15;
    }
    if (processingQueue.length + reviewQueue.length + approvedArticles.length > 0) {
      progress += 20;
    }
    if (reviewQueue.length > 0) {
      progress += 15;
    }
    if (approvedArticles.length > 0) {
      progress += 20;
    }

    return Math.min(100, progress);
  }, [approvedArticles, enabledSources.length, parameters.endDate, parameters.startDate, parameters.title, processingQueue.length, reviewQueue.length]);

  const nextRecommendedAction = useMemo(() => {
    if (processingQueue.length > 0) {
      return "Process the queued items to prepare evidence for review.";
    }

    if (reviewQueue.length > 0) {
      return "Review the prepared items and approve the strongest evidence.";
    }

    if (approvedArticles.length > 0) {
      return "Export the report draft or publish the workspace.";
    }

    if (enabledSources.length > 0) {
      return "Run the selected sources to gather new article material.";
    }

    return "Enable at least one source to start building the report.";
  }, [approvedArticles.length, enabledSources.length, processingQueue.length, reviewQueue.length]);

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

  const reportDraft = useMemo(() => {
    const grouped = reportSections.map((section) => ({
      section,
      items: approvedArticles.filter(
        (article) => getNormalizedReportSection(article.reportSection) === section,
      ),
    }));

    return grouped.filter((group) => group.items.length > 0);
  }, [approvedArticles]);

  function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceForm.name.trim() || !sourceForm.coverage.trim()) {
      setIngestionMessage("Please provide a source name and coverage note before saving.");
      return;
    }

    const name = sourceForm.name.trim();
    const backendSupported = supportedBackendSources.some((source) => source.name === name);

    if (editingSourceId) {
      setSources((currentSources) =>
        currentSources.map((source) =>
          source.id === editingSourceId
            ? { ...source, ...sourceForm, backendSupported: backendSupported || source.backendSupported }
            : source,
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
          backendSupported,
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
      setIngestionMessage("Add a title and source URL before queueing an article.");
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
    setWorkspaceId(null);
    setWorkspaceStatus("draft");
    setWorkspacePublishedAt(null);
    setRestoredWorkspaceNotice(null);
    setIngestionMessage("Workspace reset to the default sample data.");
  }

  async function ingestReliefWebReports() {
    setIsIngesting(true);
    setIngestionMessage(
      "Fetching source material from the scraper pipeline for the selected period and filters...",
    );

    try {
      const selectedSources = sources
        .filter((source) => source.enabled && source.backendSupported)
        .map((source) => source.name);
      const activeSubjects = parameters.subjects.filter(Boolean);
      const activeRegions = parameters.regions.filter(Boolean);

      if (selectedSources.length === 0) {
        throw new Error("Enable at least one backend source before running ingest.");
      }

      if (activeSubjects.length === 0 || activeRegions.length === 0) {
        throw new Error("Select at least one subject and one region before running ingest.");
      }

      const response = await fetch(`${scraperApiBaseUrl}/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: parameters.startDate,
          endDate: parameters.endDate,
          subjects: activeSubjects,
          regions: activeRegions,
          enabledSources: selectedSources,
        }),
      });

      const payload = (await response.json()) as {
        articles?: IngestedArticle[];
        error?: string;
        count?: number;
        sourceHealth?: SourceHealthEntry[];
        lastErrors?: Array<{ source: string; message: string }>;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Ingestion failed.");
      }

      const incomingArticles = payload.articles ?? [];

      let newArticleCount = 0;
      let duplicateCount = 0;

      setArticles((currentArticles) => {
        const existingKeys = new Set(
          currentArticles.map((article) => `${article.url}|${article.title}`),
        );
        const nextId = Math.max(0, ...currentArticles.map((article) => article.id)) + 1;
        const newArticles = incomingArticles
          .filter((article) => {
            const key = `${article.url}|${article.title}`;
            const isDuplicate = existingKeys.has(key);
            if (isDuplicate) {
              duplicateCount += 1;
            } else {
              newArticleCount += 1;
            }
            return !isDuplicate;
          })
          .map((article, index): Article => {
              const baseArticle = {
              title: article.title,
              source: article.source,
              url: article.url,
              date: article.date,
              region: article.region,
              subject: article.subject,
              confidence: (article.confidence as Confidence | undefined) ?? "High",
              status: "Processed" as IngestionStatus,
            };

            return {
              ...baseArticle,
              id: nextId + index,
              confidence: baseArticle.confidence,
              status: baseArticle.status,
              extractedSummary: article.summary ?? createExtractedSummary(baseArticle as Article),
              extractedFacts: article.extractedFacts ?? createExtractedFacts(baseArticle as Article),
            };
          });

        return [...newArticles, ...currentArticles];
      });

      setIngestionMessage(formatIngestResultMessage(payload, incomingArticles, newArticleCount, duplicateCount));
      setHealthStatus((current) => ({
        ...current,
        sourceHealth: payload.sourceHealth ?? current.sourceHealth,
        lastErrors: payload.lastErrors ?? current.lastErrors,
      }));
      void refreshHealthStatus();
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

function getNormalizedReportSection(section?: ReportSection): ReportSection {
    if (!section || section === "Regional Situation Overview") {
      return "Context Overview";
    }
    return section;
  }

  function getReportSectionDisplayTitle(section: ReportSection) {
    switch (section) {
      case "Context Overview":
        return "Context";
      case "Multisectoral Analysis":
        return "Multisectoral";
      case "Access Constraints":
        return "Access constraints";
      case "Government and Humanitarian Response":
        return "Humanitarian and government response";
      case "Outlook / Watchpoints":
        return "Outlook / watchpoints";
      default:
        return section;
    }
  }

  function getContextRegionLabel(region: string) {
    const normalized = region.trim();
    const regionMap: Record<string, string> = {
      "NE Region": "North-East",
      "NW Region": "North-West",
      "North Central": "North-Central",
      Borno: "North-East",
      Adamawa: "North-East",
      Yobe: "North-East",
      Zamfara: "North-West",
      Katsina: "North-West",
      Sokoto: "North-West",
      Kaduna: "North-Central",
      Kebbi: "North-West",
      "National Overview": "National Overview",
    };

    return regionMap[normalized] || normalized;
  }

  function getMultisectorSubsection(subject: string) {
    const normalized = subject.toLowerCase();
    if (normalized.includes("food")) {
      return "Food security";
    }
    if (normalized.includes("health") || normalized.includes("nutrition")) {
      return "Health and nutrition";
    }
    if (normalized.includes("protection")) {
      return "Protection";
    }
    if (normalized.includes("shelter") || normalized.includes("nfi")) {
      return "Shelter / NFI";
    }
    if (normalized.includes("wash")) {
      return "WASH";
    }

    return "Other multisectoral issues";
  }

  function renderSourceCitation(article: Article) {
    return `[<a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">${escapeHtml(article.source)}</a>]`;
  }

  function renderBulletHtml(article: Article) {
    return `
      <li>
        ${escapeHtml(article.extractedSummary ?? createExtractedSummary(article))} ${renderSourceCitation(article)}
      </li>
    `;
  }

  function buildPublishReadyReportHtml() {
    const approvedRegions = Array.from(new Set(approvedArticles.map((article) => getContextRegionLabel(article.region))));
    const approvedSubjects = Array.from(new Set(approvedArticles.map((article) => article.subject)));
    const approvedSources = Array.from(new Set(approvedArticles.map((article) => article.source)));

    const initialSectionCounts: Record<ReportSection, number> = {
      "Context Overview": 0,
      "Regional Situation Overview": 0,
      "Multisectoral Analysis": 0,
      "Access Constraints": 0,
      "Government and Humanitarian Response": 0,
      "Outlook / Watchpoints": 0,
    };

    const sectionCounts = reportSections.reduce<Record<ReportSection, number>>((counts, section) => {
      counts[section] = approvedArticles.filter(
        (article) => getNormalizedReportSection(article.reportSection) === section,
      ).length;
      return counts;
    }, { ...initialSectionCounts });

    const summaryText =
      approvedArticles.length === 0
        ? "No approved source items have been cleared for this report."
        : `During the reporting period, ${approvedArticles.length} approved items were cleared for inclusion across ${approvedRegions.length} region${
            approvedRegions.length === 1 ? "" : "s"
          } and ${approvedSubjects.length} subject area${approvedSubjects.length === 1 ? "" : "s"}.`;

    const sourceCounts = approvedArticles.reduce<Record<string, number>>((counts, article) => {
      counts[article.source] = (counts[article.source] ?? 0) + 1;
      return counts;
    }, {});

    const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];

    const keyFindings = [
      `The report is built from ${approvedArticles.length} approved evidence item${approvedArticles.length === 1 ? "" : "s"}.`,
      `Context and multisectoral coverage are the strongest sections with ${sectionCounts["Context Overview"]} and ${sectionCounts["Multisectoral Analysis"]} approved item${
        sectionCounts["Multisectoral Analysis"] === 1 ? "" : "s"
      }.`,
      topSource
        ? `Source coverage is led by ${escapeHtml(topSource[0])} with ${topSource[1]} approved item${topSource[1] === 1 ? "" : "s"}.`
        : "No source is dominant in the current approved evidence set.",
    ];

    const buildContextSection = () => {
      const contextItems = approvedArticles.filter(
        (article) => getNormalizedReportSection(article.reportSection) === "Context Overview",
      );
      if (contextItems.length === 0) {
        return '<p class="section-note">No approved items are currently assigned to the context section.</p>';
      }

      const groupedByRegion = contextItems.reduce<Record<string, Article[]>>((groups, article) => {
        const label = getContextRegionLabel(article.region);
        groups[label] = groups[label] || [];
        groups[label].push(article);
        return groups;
      }, {});

      const regionOrder = ["North-East", "North-Central", "North-West", "National Overview"];
      const orderedRegions = [...regionOrder, ...Object.keys(groupedByRegion).filter((region) => !regionOrder.includes(region))];

      return orderedRegions
        .filter((region) => groupedByRegion[region]?.length)
        .map((region) => {
          const items = groupedByRegion[region];
          return `
            <div class="subsection">
              <h3>${escapeHtml(region)}</h3>
              <p class="section-intro">${items.length} approved item${items.length === 1 ? "" : "s"} support this region.</p>
              <ul>
                ${items.map(renderBulletHtml).join("")}
              </ul>
            </div>
          `;
        })
        .join("");
    };

    const buildMultisectorSection = () => {
      const multisectorItems = approvedArticles.filter(
        (article) => getNormalizedReportSection(article.reportSection) === "Multisectoral Analysis",
      );
      if (multisectorItems.length === 0) {
        return '<p class="section-note">No approved items are currently assigned to multisectoral analysis.</p>';
      }

      const groupedByTopic = multisectorItems.reduce<Record<string, Article[]>>((groups, article) => {
        const subsection = getMultisectorSubsection(article.subject);
        groups[subsection] = groups[subsection] || [];
        groups[subsection].push(article);
        return groups;
      }, {});

      const topicOrder = [
        "Food security",
        "Health and nutrition",
        "Protection",
        "Shelter / NFI",
        "WASH",
        "Other multisectoral issues",
      ];

      return topicOrder
        .filter((topic) => groupedByTopic[topic]?.length)
        .map((topic) => {
          const items = groupedByTopic[topic];
          return `
            <div class="subsection">
              <h3>${escapeHtml(topic)}</h3>
              <ul>
                ${items.map(renderBulletHtml).join("")}
              </ul>
            </div>
          `;
        })
        .join("");
    };

    const buildAccessSection = () => {
      const accessItems = approvedArticles.filter(
        (article) => getNormalizedReportSection(article.reportSection) === "Access Constraints",
      );
      if (accessItems.length === 0) {
        return '<p class="section-note">No approved items are currently assigned to access constraints.</p>';
      }

      const groupedByRegion = accessItems.reduce<Record<string, Article[]>>((groups, article) => {
        const label = getContextRegionLabel(article.region);
        groups[label] = groups[label] || [];
        groups[label].push(article);
        return groups;
      }, {});

      const regionOrder = ["North-East", "North-Central", "North-West", "National Overview"];
      return regionOrder
        .filter((region) => groupedByRegion[region]?.length)
        .map((region) => {
          const items = groupedByRegion[region];
          return `
            <div class="subsection">
              <h3>${escapeHtml(region)}</h3>
              <ul>
                ${items.map(renderBulletHtml).join("")}
              </ul>
            </div>
          `;
        })
        .join("");
    };

    const buildResponseSection = () => {
      const responseItems = approvedArticles.filter(
        (article) => getNormalizedReportSection(article.reportSection) === "Government and Humanitarian Response",
      );
      if (responseItems.length === 0) {
        return '<p class="section-note">No approved items are currently assigned to the response section.</p>';
      }

      const governmentItems = responseItems.filter((article) =>
        article.subject.toLowerCase().includes("government"),
      );
      const humanitarianItems = responseItems.filter((article) =>
        article.subject.toLowerCase().includes("humanitarian"),
      );
      const otherItems = responseItems.filter(
        (article) =>
          !article.subject.toLowerCase().includes("government") &&
          !article.subject.toLowerCase().includes("humanitarian"),
      );

      return `
        ${governmentItems.length > 0 ? `
          <div class="subsection">
            <h3>Government response</h3>
            <ul>
              ${governmentItems.map(renderBulletHtml).join("")}
            </ul>
          </div>
        ` : ""}
        ${humanitarianItems.length > 0 ? `
          <div class="subsection">
            <h3>Humanitarian response</h3>
            <ul>
              ${humanitarianItems.map(renderBulletHtml).join("")}
            </ul>
          </div>
        ` : ""}
        ${otherItems.length > 0 ? `
          <div class="subsection">
            <h3>Additional response notes</h3>
            <ul>
              ${otherItems.map(renderBulletHtml).join("")}
            </ul>
          </div>
        ` : ""}
      `;
    };

    const buildOutlookSection = () => {
      const outlookItems = approvedArticles.filter(
        (article) => getNormalizedReportSection(article.reportSection) === "Outlook / Watchpoints",
      );

      if (outlookItems.length === 0) {
        return '<p class="section-note">No approved items are currently assigned to outlook or watchpoints.</p>';
      }

      return `
        <ul>
          ${outlookItems.map(renderBulletHtml).join("")}
        </ul>
      `;
    };

    const tocItems = reportSections
      .map((section, sectionIndex) => {
        const count = sectionCounts[section];
        const title = getReportSectionDisplayTitle(section).toUpperCase();
        return `<li><strong>${romanNumerals[sectionIndex + 1]}.</strong> ${escapeHtml(title)} (${count} item${count === 1 ? "" : "s"})</li>`;
      })
      .join("");

    const sectionHtml = reportSections
      .map((section, sectionIndex) => {
        const title = `${romanNumerals[sectionIndex + 1]}. ${getReportSectionDisplayTitle(section).toUpperCase()}`;
        let body = "";

        switch (section) {
          case "Context Overview":
            body = buildContextSection();
            break;
          case "Multisectoral Analysis":
            body = buildMultisectorSection();
            break;
          case "Access Constraints":
            body = buildAccessSection();
            break;
          case "Government and Humanitarian Response":
            body = buildResponseSection();
            break;
          case "Outlook / Watchpoints":
            body = buildOutlookSection();
            break;
          default:
            body = "";
        }

        return `
          <section>
            <h2>${escapeHtml(title)}</h2>
            <div class="section-intro">${
              sectionCounts[section] > 0
                ? `${sectionCounts[section]} approved item${sectionCounts[section] === 1 ? "" : "s"} provide evidence for this section.`
                : "No approved items are available for this section yet."
            }</div>
            ${body}
          </section>
        `;
      })
      .join("");

    return `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(parameters.title)}</title>
          <style>
            body { font-family: Inter, Arial, Helvetica, sans-serif; margin: 0; padding: 28px; color: #111827; line-height: 1.65; background: #fff; }
            h1 { font-size: 28px; margin: 0 0 10px; letter-spacing: 0.04em; text-transform: uppercase; }
            h2 { font-size: 18px; margin: 30px 0 10px; color: #111827; }
            h3 { font-size: 15px; margin: 22px 0 8px; color: #1f2937; }
            p, li { font-size: 13px; margin: 0; }
            ul { padding-left: 22px; margin: 10px 0 0; }
            .meta { color: #4b5563; margin: 0; }
            .header { padding-bottom: 18px; margin-bottom: 28px; border-bottom: 1px solid #e5e7eb; }
            .section-intro { margin: 10px 0 14px; color: #374151; font-size: 13px; }
            .subsection { margin-top: 16px; }
            .subsection h3 { margin-top: 16px; }
            .section-note { color: #4b5563; margin-top: 10px; font-size: 13px; }
            .toc { padding-left: 18px; margin: 10px 0 0; color: #4b5563; }
            .toc li { margin-bottom: 6px; }
            a { color: #2563eb; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${escapeHtml(parameters.title)}</h1>
            <p class="meta">Reporting Period: ${escapeHtml(formatDate(parameters.startDate))} – ${escapeHtml(
              formatDate(parameters.endDate),
            )}</p>
            <p class="meta">Classification: ${escapeHtml(parameters.classification)}</p>
            <p class="meta">Approved items: ${approvedArticles.length}; regions: ${approvedRegions.length}; subjects: ${approvedSubjects.length}.</p>
          </div>

          <h2>Key findings</h2>
          <ul>
            ${keyFindings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}
          </ul>

          <h2>I. Contents</h2>
          <ul class="toc">
            ${tocItems}
          </ul>

          ${sectionHtml}
        </body>
      </html>`;
  }

  async function saveWorkspaceToServer(nextStatus: WorkspaceStatus = "draft") {
    const publishedAt = nextStatus === "published" ? (workspacePublishedAt ?? new Date().toISOString()) : null;

    try {
      const response = await fetch(`${scraperApiBaseUrl}/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: workspaceId ?? `workspace-${Date.now()}`,
          parameters,
          sources,
          articles,
          status: nextStatus,
          publishedAt,
          title: parameters.title,
        }),
      });

      const payload = (await response.json()) as { workspace?: { id?: string; status?: WorkspaceStatus; publishedAt?: string | null }; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save workspace draft.");
      }

      if (payload.workspace?.id) {
        setWorkspaceId(payload.workspace.id);
      }

      setWorkspaceStatus(payload.workspace?.status ?? nextStatus);
      setWorkspacePublishedAt(payload.workspace?.publishedAt ?? publishedAt);
      await refreshServerWorkspaces();
      setIngestionMessage(
        nextStatus === "published"
          ? "Workspace published and saved to the server."
          : "Workspace draft saved to the server.",
      );
    } catch (error) {
      setIngestionMessage(error instanceof Error ? error.message : "Unable to save workspace draft.");
    }
  }

  async function loadWorkspaceById(workspaceId: string) {
    try {
      const response = await fetch(`${scraperApiBaseUrl}/workspaces/${workspaceId}`);
      const payload = (await response.json()) as { workspace?: WorkspaceSummary & { id?: string; status?: WorkspaceStatus; title?: string; publishedAt?: string | null }; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load workspace.");
      }

      const nextWorkspace = payload.workspace;
      if (!nextWorkspace) {
        throw new Error("The selected workspace could not be loaded.");
      }

      setWorkspaceId(nextWorkspace.id ?? null);
      setWorkspaceStatus((nextWorkspace.status as WorkspaceStatus | undefined) ?? "draft");
      setWorkspacePublishedAt(nextWorkspace.publishedAt ?? null);
      setParameters(nextWorkspace.parameters ?? initialParameters);
      setSources(hydrateWorkspaceSources(nextWorkspace.sources ?? []));
      setArticles(nextWorkspace.articles ?? initialArticles);
      setIngestionMessage(`Loaded workspace: ${nextWorkspace.title ?? "Untitled workspace"}`);
      await refreshServerWorkspaces();
    } catch (error) {
      setIngestionMessage(error instanceof Error ? error.message : "Unable to load workspace.");
    }
  }

  async function loadWorkspaceFromServer(status: WorkspaceStatus = "draft") {
    try {
      const response = await fetch(`${scraperApiBaseUrl}/workspaces?status=${status}`);
      const payload = (await response.json()) as { workspaces?: Array<WorkspaceState & { id?: string; status?: WorkspaceStatus; title?: string; publishedAt?: string | null }>; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load workspace draft.");
      }

      const latestWorkspace = payload.workspaces?.[0];
      if (!latestWorkspace) {
        throw new Error(status === "published" ? "No published workspace is available yet." : "No workspace drafts are available yet.");
      }

      setWorkspaceId(latestWorkspace.id ?? null);
      setWorkspaceStatus(latestWorkspace.status ?? status);
      setWorkspacePublishedAt(latestWorkspace.publishedAt ?? null);
      setParameters(latestWorkspace.parameters ?? initialParameters);
      setSources(hydrateWorkspaceSources(latestWorkspace.sources ?? []));
      setArticles(latestWorkspace.articles ?? initialArticles);
      await refreshServerWorkspaces();
      setIngestionMessage(
        status === "published"
          ? `Loaded published workspace: ${latestWorkspace.title ?? parameters.title}`
          : `Loaded workspace draft: ${latestWorkspace.title ?? parameters.title}`,
      );
    } catch (error) {
      setIngestionMessage(error instanceof Error ? error.message : "Unable to load workspace draft.");
    }
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
      buildPublishReadyReportHtml(),
      "application/msword;charset=utf-8",
    );
  }

  function printReportPdf() {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!reportWindow) {
      return;
    }

    reportWindow.document.write(buildPublishReadyReportHtml());
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
              Autosaved
            </div>
          </div>
        </div>
      </section>

      {restoredWorkspaceNotice ? (
        <div className="mx-auto max-w-7xl px-5 py-2 sm:px-8">
          <div className="rounded-md bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
            {restoredWorkspaceNotice}
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <section className="border border-zinc-200 bg-white p-4">
            <h2 className="text-lg font-semibold">1. Define report scope</h2>
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
              Quick actions
            </h3>
            <div className="mt-3 grid gap-2">
              <button
                onClick={() => setActiveModal("workspace")}
                className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-800"
              >
                Workspace & export
              </button>
              <button
                onClick={() => setActiveModal("health")}
                className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-800"
              >
                Pipeline health
              </button>
              <button
                onClick={() => setActiveModal("draft")}
                className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-800"
              >
                Report draft shape
              </button>
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
          <section className="grid gap-5">
            <div className="border border-zinc-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">2. Manage sources</h2>
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
                          <div className="flex items-center gap-2">
                            <span className={source.enabled ? "" : "text-zinc-400"}>
                              {source.name}
                            </span>
                            {source.backendSupported ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                live
                              </span>
                            ) : (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                                manual
                              </span>
                            )}
                          </div>
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

          </section>

          <section className="border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">3. Gather evidence</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Queue source material before extraction, deduplication, and analyst review.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void ingestReliefWebReports();
                  }}
                  disabled={isIngesting}
                  className="w-fit rounded-md border border-zinc-950 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                >
                  {isIngesting ? "Running ingest" : "Run selected sources"}
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

            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-100/70 p-3 text-sm text-zinc-600">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">
                    Workflow cue
                  </div>
                  <p className="mt-1 break-words text-sm leading-5 text-zinc-700">
                    {nextRecommendedAction}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                  Next step
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {filteredArticles.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600">
                  No articles match the current filters yet. Adjust the report scope or enable more sources to see items here.
                </div>
              ) : null}
              {filteredArticles.map((article) => (
                <article key={`article-${article.id}`} className="border border-zinc-200 bg-zinc-50 p-4">
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

          <section className="grid gap-5">
            <div className="border border-zinc-200 bg-white p-3">
              <h2 className="text-lg font-semibold">4. Process the queue</h2>
              <p className="mt-1 text-sm text-zinc-600">Convert queued material into structured evidence.</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className={`rounded-md p-3 text-center ${processingQueue.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-zinc-50 border border-zinc-200'}`}>
                  <div className="text-xs text-zinc-600">Queued</div>
                  <div className="text-2xl font-semibold text-zinc-950">{processingQueue.length}</div>
                </div>
                <div className={`rounded-md p-3 text-center ${reviewQueue.length > 0 ? 'bg-sky-50 border border-sky-200' : 'bg-zinc-50 border border-zinc-200'}`}>
                  <div className="text-xs text-zinc-600">Review</div>
                  <div className="text-2xl font-semibold text-zinc-950">{reviewQueue.length}</div>
                  {reviewQueue.length > 0 && <div className="mt-1 inline-block text-xs text-sky-700 rounded-full bg-white px-2 py-0.5">Awaiting</div>}
                </div>
                <div className={`rounded-md p-3 text-center ${approvedArticles.length > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-zinc-50 border border-zinc-200'}`}>
                  <div className="text-xs text-zinc-600">Approved</div>
                  <div className="text-2xl font-semibold text-zinc-950">{approvedArticles.length}</div>
                </div>
              </div>
              <button onClick={processQueuedArticles} className="mt-3 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">Process queued items</button>
            </div>

            <div className="border border-zinc-200 bg-white p-3">
              <h2 className="text-lg font-semibold">5. Review and approve</h2>
              <p className="mt-1 text-sm text-zinc-600">Edit extracted language, confirm confidence, and approve sourced claims.</p>

              <div className="mt-3 space-y-3">
                {reviewQueue.length === 0 ? (
                  <div className="border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">No processed items are waiting for review.</div>
                ) : null}

                {reviewQueue.map((article) => (
                  <article key={`review-${article.id}`} className="border border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1">
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
                <h2 className="text-lg font-semibold">6. Generate report</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Approved evidence is assembled into the weekly situation update structure.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void saveWorkspaceToServer("published");
                  }}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                >
                  Publish draft
                </button>
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
                    <h4 className="font-semibold">Key findings</h4>
                    <p className="mt-2 text-sm leading-6 text-zinc-700">
                      {approvedArticles.length} approved item{approvedArticles.length === 1 ? "" : "s"} are currently available for the publish-ready draft. The top sections are based on the evidence assigned to the report structure below.
                    </p>
                    <div className="mt-3 grid gap-2 border-t border-zinc-200 pt-3 text-xs text-zinc-600 sm:grid-cols-2">
                      <div>
                        <span className="font-semibold">Regions:</span>{" "}
                        {Array.from(new Set(approvedArticles.map((article) => getContextRegionLabel(article.region)))).join(", ")}
                      </div>
                      <div>
                        <span className="font-semibold">Subjects:</span>{" "}
                        {Array.from(new Set(approvedArticles.map((article) => article.subject))).join(", ")}
                      </div>
                    </div>
                  </section>

                  {reportDraft.map((group, groupIndex) => (
                    <section key={group.section}>
                      <h4 className="font-semibold">
                        {romanNumerals[groupIndex + 1]}. {getReportSectionDisplayTitle(group.section)}
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-zinc-700">
                        {group.items[0]?.extractedSummary ?? "No example sentence available."}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {group.items.length} approved item{group.items.length === 1 ? "" : "s"} in this section.
                      </p>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Report draft shape</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  A compact view of the outline and scope that will appear in the final report.
                </p>
              </div>
              <button
                onClick={() => setActiveModal("draft")}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
              >
                Open
              </button>
            </div>
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <p className="font-semibold">{parameters.title.toUpperCase()}</p>
              <p className="mt-2 text-zinc-600">
                Reporting Period: {formatDate(parameters.startDate)} - {formatDate(parameters.endDate)}
              </p>
              <p className="text-zinc-600">Classification: {parameters.classification}</p>
              <div className="mt-4 rounded-lg bg-white p-3 text-zinc-700">
                <div className="text-xs uppercase tracking-[0.15em] text-zinc-500">Approved report sections</div>
                {reportDraft.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-600">No approved sections yet. Approve reviewed items to fill the report draft.</p>
                ) : (
                  <ol className="mt-3 space-y-2 text-sm text-zinc-700">
                    {reportDraft.map((group, index) => (
                      <li key={group.section} className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-zinc-800">
                          <span>{romanNumerals[index + 1]}. {group.section}</span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{group.items.length} item{group.items.length === 1 ? "" : "s"}</span>
                        </div>
                        <p className="text-xs text-zinc-600">{group.items[0]?.extractedSummary ?? "No summary available."}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {activeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  {activeModal === "workspace"
                    ? "Workspace & export"
                    : activeModal === "health"
                      ? "Pipeline health"
                      : "Report draft shape"}
                </h3>
                <p className="mt-1 text-sm text-zinc-600">
                  {activeModal === "workspace"
                    ? "Save, load, export, or reset the current report workspace."
                    : activeModal === "health"
                      ? "Inspect the latest ingest health, storage state, and scheduler status."
                      : "Review the draft report structure before exporting or publishing."}
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="p-5">
              {activeModal === "workspace" ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                    <div className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700">
                      Status: {workspaceStatus === "published" ? "Published" : "Draft"}
                    </div>
                    {workspacePublishedAt ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        Published {new Date(workspacePublishedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {serverWorkspaces.length > 0 ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                      <h4 className="text-sm font-semibold text-zinc-900">Saved workspaces</h4>
                      <ul className="mt-2 space-y-2 text-sm text-zinc-600">
                        {serverWorkspaces.slice(0, 5).map((workspace) => (
                          <li key={workspace.id ?? `${workspace.title ?? "workspace"}-${workspace.updatedAt ?? "unknown"}`} className="rounded-md border border-zinc-200 bg-white p-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (workspace.id) {
                                  void loadWorkspaceById(workspace.id);
                                }
                              }}
                              className="w-full text-left"
                            >
                              <div className="font-medium text-zinc-800">{workspace.title ?? "Untitled workspace"}</div>
                              <div className="mt-1 flex items-center gap-2 text-xs">
                                <span className="rounded-full bg-zinc-100 px-2 py-1 uppercase tracking-[0.12em] text-zinc-700">
                                  {workspace.status ?? "draft"}
                                </span>
                                {workspace.updatedAt ? <span>{new Date(workspace.updatedAt).toLocaleString()}</span> : null}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() => {
                        void saveWorkspaceToServer("draft");
                        setActiveModal(null);
                      }}
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                    >
                      Save draft to server
                    </button>
                    <button
                      onClick={() => {
                        void loadWorkspaceFromServer("draft");
                        setActiveModal(null);
                      }}
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                    >
                      Load latest draft
                    </button>
                    <button
                      onClick={() => {
                        void loadWorkspaceFromServer("published");
                        setActiveModal(null);
                      }}
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                    >
                      Load latest published
                    </button>
                    <button
                      onClick={() => {
                        exportWorkspaceJson();
                        setActiveModal(null);
                      }}
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                    >
                      Export workspace JSON
                    </button>
                    <button
                      onClick={() => {
                        resetWorkspace();
                        setActiveModal(null);
                      }}
                      className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700"
                    >
                      Reset workspace
                    </button>
                  </div>
                </div>
              ) : activeModal === "health" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        healthStatus.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {healthStatus.ok ? "Online" : "Offline"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        healthStatus.mongo?.connected
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {healthStatus.mongo?.connected ? "MongoDB connected" : "MongoDB unavailable"}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                      {healthStatus.snapshotCount} snapshot items
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600">{healthMessage}</p>
                  {healthStatus.mongo?.message ? (
                    <p className="mt-2 text-sm text-zinc-500">{healthStatus.mongo.message}</p>
                  ) : null}
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                    <h4 className="text-sm font-semibold text-zinc-900">Persisted state</h4>
                    <div className="mt-2 space-y-1 text-sm text-zinc-600">
                      <div>Snapshots: {healthStatus.snapshotCount}</div>
                      <div>Saved workspaces: {healthStatus.workspaceCount ?? serverWorkspaces.length}</div>
                      <div>Latest workspace: {healthStatus.latestWorkspaceTitle ?? "None yet"}</div>
                      {healthStatus.latestWorkspaceUpdatedAt ? (
                        <div>Updated: {new Date(healthStatus.latestWorkspaceUpdatedAt).toLocaleString()}</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                    <h4 className="text-sm font-semibold text-zinc-900">ACLED auth</h4>
                    <div className="mt-2 text-sm text-zinc-600">
                      {acledTokenStatus.ok && acledTokenStatus.token?.expires_at ? (
                        <>
                          <div className="font-medium text-emerald-700">Token available</div>
                          <div>Expires: {new Date(acledTokenStatus.token.expires_at * 1000).toLocaleString()}</div>
                        </>
                      ) : (
                        <div className="font-medium text-amber-700">No stored ACLED token yet</div>
                      )}
                    </div>
                  </div>
                  {healthStatus.sourceHealth.length > 0 ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                      <h4 className="text-sm font-semibold text-zinc-900">Source status</h4>
                      <ul className="mt-2 space-y-2 text-sm text-zinc-600">
                        {healthStatus.sourceHealth.map((entry) => (
                          <li key={entry.name} className="flex items-center justify-between gap-2">
                            <span>{entry.name}</span>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                              {entry.ok ? `${entry.count} item${entry.count === 1 ? "" : "s"}` : "error"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {healthStatus.lastErrors.length > 0 ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                      <h4 className="text-sm font-semibold text-zinc-900">Recent failures</h4>
                      <ul className="mt-2 space-y-2 text-sm text-zinc-600">
                        {healthStatus.lastErrors.map((entry, index) => (
                          <li key={`${entry.source}-${index}`} className="border-l-2 border-rose-300 pl-2">
                            <div className="font-medium text-zinc-800">{entry.source}</div>
                            <div>{entry.message}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {healthStatus.scheduler ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                      <h4 className="text-sm font-semibold text-zinc-900">Scheduler</h4>
                      <p className="mt-2 text-sm text-zinc-600">
                        {healthStatus.scheduler.enabled ? "Enabled" : "Disabled"} • {healthStatus.scheduler.running ? "Running" : "Stopped"}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Interval: {healthStatus.scheduler.intervalMinutes} min
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Next run: {healthStatus.scheduler.nextRunAt ? new Date(healthStatus.scheduler.nextRunAt).toLocaleString() : "Not scheduled"}
                      </p>
                    </div>
                  ) : null}
                  <button
                    onClick={() => void refreshHealthStatus()}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold"
                  >
                    Refresh health
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
                    <p className="font-semibold">{parameters.title.toUpperCase()}</p>
                    <p className="mt-2 text-zinc-600">
                      Reporting Period: {formatDate(parameters.startDate)} - {formatDate(parameters.endDate)}
                    </p>
                    <p className="text-zinc-600">Classification: {parameters.classification}</p>
                  </div>
                  <ol className="space-y-2 text-sm text-zinc-700">
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
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
