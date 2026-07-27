type IngestRequest = {
  startDate: string;
  endDate: string;
  subjects: string[];
  regions: string[];
};

type ReliefWebReport = {
  id: string;
  fields?: {
    title?: string;
    url_alias?: string;
    date?: {
      created?: string;
    };
    source?: Array<{
      name?: string;
    }>;
    body?: string;
  };
};

const regionTerms = {
  "NE Region": ["Borno", "Adamawa", "Yobe", "northeast", "north-east"],
  "NW Region": ["Zamfara", "Katsina", "Sokoto", "Kebbi", "Kaduna", "northwest", "north-west"],
  "North Central": ["Niger", "Plateau", "Benue", "Nasarawa", "Kogi", "Kwara", "FCT"],
};

const subjectKeywords = [
  { subject: "Food Security", terms: ["food security", "hunger", "famine", "ipc"] },
  { subject: "Nutrition", terms: ["nutrition", "malnutrition", "sam", "mam"] },
  { subject: "Health", terms: ["health", "cholera", "outbreak", "disease", "clinic"] },
  { subject: "WASH", terms: ["wash", "water", "sanitation", "hygiene"] },
  { subject: "Security", terms: ["attack", "abduction", "kidnap", "armed", "conflict"] },
  { subject: "Education", terms: ["school", "education", "learning"] },
  { subject: "Shelter / NFI", terms: ["shelter", "nfi", "household items"] },
  { subject: "Humanitarian Response", terms: ["humanitarian", "response", "assistance"] },
  { subject: "Government Response", terms: ["government", "authority", "ministry"] },
];

function pickRegion(text: string, requestedRegions: string[]) {
  const normalized = text.toLowerCase();

  for (const region of requestedRegions) {
    if (region === "National Overview") {
      continue;
    }

    const terms = regionTerms[region as keyof typeof regionTerms] ?? [region];
    if (terms.some((term) => normalized.includes(term.toLowerCase()))) {
      return region;
    }
  }

  return requestedRegions[0] ?? "National Overview";
}

function pickSubject(text: string, requestedSubjects: string[]) {
  const normalized = text.toLowerCase();

  for (const candidate of subjectKeywords) {
    if (
      requestedSubjects.includes(candidate.subject) &&
      candidate.terms.some((term) => normalized.includes(term))
    ) {
      return candidate.subject;
    }
  }

  return requestedSubjects[0] ?? "Security";
}

export async function POST(request: Request) {
  const body = (await request.json()) as IngestRequest;
  const searchTerms = [
    "Nigeria",
    ...body.regions.filter((region) => region !== "National Overview"),
    ...body.subjects,
  ];

  const reliefWebResponse = await fetch(
    "https://api.reliefweb.int/v1/reports?appname=northern-nigeria-situation-monitor",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appname: "northern-nigeria-situation-monitor",
        limit: 12,
        preset: "latest",
        profile: "list",
        query: {
          value: searchTerms.join(" "),
          operator: "OR",
        },
        filter: {
          operator: "AND",
          conditions: [
            {
              field: "country.name",
              value: "Nigeria",
            },
            {
              field: "date.created",
              value: {
                from: body.startDate,
                to: body.endDate,
              },
            },
          ],
        },
        fields: {
          include: ["title", "url_alias", "date.created", "source.name", "body"],
        },
        sort: ["date.created:desc"],
      }),
    },
  );

  if (!reliefWebResponse.ok) {
    return Response.json(
      {
        error: `ReliefWeb request failed with status ${reliefWebResponse.status}`,
      },
      { status: reliefWebResponse.status },
    );
  }

  const data = (await reliefWebResponse.json()) as { data?: ReliefWebReport[] };
  const articles =
    data.data?.map((report) => {
      const fields = report.fields ?? {};
      const title = fields.title ?? "Untitled ReliefWeb report";
      const source = fields.source?.[0]?.name ?? "ReliefWeb";
      const text = `${title} ${fields.body ?? ""}`;

      return {
        title,
        source,
        url: fields.url_alias ?? `https://reliefweb.int/report/${report.id}`,
        date: fields.date?.created?.slice(0, 10) ?? body.endDate,
        region: pickRegion(text, body.regions),
        subject: pickSubject(text, body.subjects),
      };
    }) ?? [];

  return Response.json({ articles });
}
