// Workflow starters — the catalog the Builder picks from when starting a
// new workflow. Each starter answers two questions: "what problem does this
// solve?" and "what product does this build?". On pick, Grounded seeds the
// workflow with the starter's problem statement, category, user instructions,
// and (where obvious) a small ready-made graph the Builder can refine.
//
// Adding a new starter:
//   1. Push an entry below.
//   2. Pick a problem_category that matches docs/AGENTS.md categories.
//   3. Keep the title under ~60 chars; the description under ~120.
//   4. Provide user_instructions written for the journalist who will run
//      the workflow, not for the Builder.
//   5. The definition can be empty — Describe-and-build or manual drag will
//      fill it. Pre-fill only when the agent composition is unambiguous.

const EMPTY_DEFINITION = { nodes: [], edges: [], inputs: [], output: { node: '', field: '' } };

const STARTERS = [
  // ─── Fact-checking ────────────────────────────────────────────────────
  {
    slug: 'fact-check-article',
    title: 'Fact-check an article',
    description: 'Run claims through the verifier with archive cross-check before you publish.',
    problem_statement: 'Stories go out without a structured fact-check pass and without checking what we already published on the topic.',
    problem_category: 'Fact-checking',
    user_instructions: 'Paste the article you want to fact-check. Grounded pulls relevant past coverage from your archive, then surfaces each claim with a verdict, evidence, and the bits you should independently confirm.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'archivist', config: { top_k: '3', citation_format: 'inline_source' }, position: { x: 80, y: 80 } },
        { id: 'n2', agent_slug: 'verifier', config: { tone: 'cautious_advisory', max_claims: '6' }, position: { x: 380, y: 80 } },
      ],
      edges: [
        { from: { node: 'n1', field: 'archiveContext' }, to: { node: 'n2', field: 'archiveContext' } },
      ],
      inputs: [
        { name: 'articleText', to: { node: 'n2', field: 'articleText' } },
        { name: 'query', to: { node: 'n1', field: 'query' } },
      ],
      output: { node: 'n2', field: 'result' },
    },
  },
  {
    slug: 'check-incoming-tip',
    title: 'Check an incoming community tip',
    description: 'Stress-test a tip from WhatsApp, a web form, or a tip line before it enters editorial.',
    problem_statement: 'Community-submitted material isn\'t being structurally checked before it gets to the desk — leaving editors to do it ad hoc.',
    problem_category: 'Fact-checking',
    user_instructions: 'Paste the tip exactly as it came in. Grounded extracts the claims, checks them against your archive, and flags what to confirm independently before you act on it.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'archivist', config: { top_k: '5' }, position: { x: 80, y: 80 } },
        { id: 'n2', agent_slug: 'verifier', config: { tone: 'plain', max_claims: '8' }, position: { x: 380, y: 80 } },
      ],
      edges: [
        { from: { node: 'n1', field: 'archiveContext' }, to: { node: 'n2', field: 'archiveContext' } },
      ],
      inputs: [
        { name: 'articleText', to: { node: 'n2', field: 'articleText' } },
        { name: 'query', to: { node: 'n1', field: 'query' } },
      ],
      output: { node: 'n2', field: 'result' },
    },
  },

  // ─── Production ────────────────────────────────────────────────────────
  {
    slug: 'multi-format-kit',
    title: 'Turn one article into a multi-format kit',
    description: 'Generate social posts, a newsletter blurb, and headline alternatives from a single article.',
    problem_statement: 'Repackaging a published story for social, newsletter, and homepage takes longer than writing it.',
    problem_category: 'Production',
    user_instructions: 'Paste the article you want to repackage. Grounded returns three social posts, a newsletter blurb, and three headline alternatives — review and pick.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'drafter', config: { task_type: 'social_copy', num_drafts: '3', tone: 'punchy' }, position: { x: 80, y: 40 } },
        { id: 'n2', agent_slug: 'drafter', config: { task_type: 'newsletter', num_drafts: '1', tone: 'conversational' }, position: { x: 80, y: 220 } },
        { id: 'n3', agent_slug: 'drafter', config: { task_type: 'headline', num_drafts: '3' }, position: { x: 80, y: 400 } },
      ],
      edges: [],
      inputs: [
        { name: 'articleText', to: { node: 'n1', field: 'articleText' } },
        { name: 'articleText', to: { node: 'n2', field: 'articleText' } },
        { name: 'articleText', to: { node: 'n3', field: 'articleText' } },
      ],
      output: { node: 'n1', field: 'result' },
    },
  },
  {
    slug: 'article-to-podcast',
    title: 'Turn an article into a podcast script',
    description: 'A spoken-word intro and outline for solo, two-host, or interview formats.',
    problem_statement: 'We have strong written reporting but no easy on-ramp to audio.',
    problem_category: 'Production',
    user_instructions: 'Paste the article. Grounded produces a podcast intro (cold-open) and outline you can use for solo, two-host, or interview formats. Producer agent will pick this up later for full audio assembly.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'drafter', config: { task_type: 'podcast_intro', num_drafts: '2', tone: 'conversational', length: 'medium' }, position: { x: 80, y: 80 } },
      ],
      edges: [],
      inputs: [{ name: 'articleText', to: { node: 'n1', field: 'articleText' } }],
      output: { node: 'n1', field: 'result' },
    },
  },
  {
    slug: 'article-to-short-video',
    title: 'Turn an article into a short-form video script',
    description: 'A vertical-video script with an opening hook and timing cues.',
    problem_statement: 'Vertical short-form is where younger readers live, but turning long-form reporting into 30-60s scripts is slow.',
    problem_category: 'Production',
    user_instructions: 'Paste the article. Grounded returns a vertical-video script with a 1-line opening hook plus 30-60 seconds of talking-head timing cues.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'drafter', config: { task_type: 'video_script', num_drafts: '2', tone: 'punchy', length: 'short' }, position: { x: 80, y: 80 } },
      ],
      edges: [],
      inputs: [{ name: 'articleText', to: { node: 'n1', field: 'articleText' } }],
      output: { node: 'n1', field: 'result' },
    },
  },

  // ─── Translation ───────────────────────────────────────────────────────
  {
    slug: 'translate-story',
    title: 'Translate a story into a local language',
    description: 'Light translation in the newsroom\'s house terminology — for one language pair.',
    problem_statement: 'Stories don\'t reach vernacular readers because translation is slow, inconsistent, and not in our voice.',
    problem_category: 'Translation',
    user_instructions: 'Paste the article and tell Grounded which language to translate into. The output is a draft — your editor signs it off. Deeper translation work with confidence scoring is coming with the Translator agent.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'drafter', config: { task_type: 'translation', num_drafts: '1', tone: 'newsroom_default' }, position: { x: 80, y: 80 } },
      ],
      edges: [],
      inputs: [
        { name: 'articleText', to: { node: 'n1', field: 'articleText' } },
        { name: 'target_language', to: { node: 'n1', field: 'target_language' } },
      ],
      output: { node: 'n1', field: 'result' },
    },
  },

  // ─── Archive ───────────────────────────────────────────────────────────
  {
    slug: 'find-past-coverage',
    title: 'Find what we\'ve already covered',
    description: 'Search your archive for past coverage on a topic before you start reporting.',
    problem_statement: '"Have we covered this before?" gets answered slowly and unreliably from memory or a colleague\'s ping.',
    problem_category: 'Archive',
    user_instructions: 'Type a topic, question, or angle. Grounded returns the most relevant passages from your newsroom\'s archive with citations.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'archivist', config: { top_k: '8', citation_format: 'numbered' }, position: { x: 80, y: 80 } },
      ],
      edges: [],
      inputs: [{ name: 'query', to: { node: 'n1', field: 'query' } }],
      output: { node: 'n1', field: 'archiveContext' },
    },
  },
  {
    slug: 'archive-context-for-story',
    title: 'Pull archive context for a story you\'re writing',
    description: 'Get cited past-coverage passages you can lean on while drafting.',
    problem_statement: 'Reporters re-research things the newsroom has already done because nobody surfaces the archive in-flow.',
    problem_category: 'Archive',
    user_instructions: 'Paste the topic, question, or a paragraph from the story you\'re drafting. Grounded pulls the matching archive passages with citations.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'archivist', config: { top_k: '5', citation_format: 'inline_source' }, position: { x: 80, y: 80 } },
      ],
      edges: [],
      inputs: [{ name: 'query', to: { node: 'n1', field: 'query' } }],
      output: { node: 'n1', field: 'archiveContext' },
    },
  },

  // ─── Audience research ────────────────────────────────────────────────
  {
    slug: 'test-a-headline',
    title: 'Test a headline with audience clones',
    description: 'Sense-check a headline against synthetic readers — including low-data and vernacular-first segments.',
    problem_statement: 'Headlines get picked from a gut read of the room, not from the audience the story\'s actually for.',
    problem_category: 'Audience research',
    user_instructions: 'Paste the headline and a 1-line summary of the story. Grounded will run it past synthetic audience personas (built from your real reader data) and surface where it lands and where it fails.',
    definition: { nodes: [], edges: [], inputs: [], output: { node: '', field: '' } },
  },
  {
    slug: 'sense-check-angle',
    title: 'Sense-check a story angle before you publish',
    description: 'Ask audience clones what they\'ll do with the framing you\'ve chosen.',
    problem_statement: 'Editorial framings don\'t get pre-tested with the audiences who\'ll actually read them.',
    problem_category: 'Audience research',
    user_instructions: 'Paste the headline + lede + intended audience. Grounded will run it past audience personas grounded in your real reader behaviour.',
    definition: { nodes: [], edges: [], inputs: [], output: { node: '', field: '' } },
  },

  // ─── Personalisation ───────────────────────────────────────────────────
  {
    slug: 'segment-rewrite',
    title: 'Personalise a story summary for a specific reader segment',
    description: 'Recast a summary for low-data, vernacular-first, or feature-phone readers.',
    problem_statement: 'A single homepage standfirst doesn\'t serve every audience the newsroom is trying to reach.',
    problem_category: 'Personalisation',
    user_instructions: 'Paste the article and tell Grounded which audience segment to write for (e.g. "feature-phone readers in rural Lusaka"). Grounded returns three short summaries shaped for that audience.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'drafter', config: { task_type: 'newsletter', num_drafts: '3', tone: 'conversational', length: 'short' }, position: { x: 80, y: 80 } },
      ],
      edges: [],
      inputs: [
        { name: 'articleText', to: { node: 'n1', field: 'articleText' } },
        { name: 'audience_segment', to: { node: 'n1', field: 'audience_segment' } },
      ],
      output: { node: 'n1', field: 'result' },
    },
  },

  // ─── Social media ─────────────────────────────────────────────────────
  {
    slug: 'platform-tailored-posts',
    title: 'Write platform-tailored social posts',
    description: 'Same story, three platforms — each with its own voice and length.',
    problem_statement: 'Cross-posting the same string to every platform performs badly. Tailoring takes time the desk doesn\'t have.',
    problem_category: 'Social media',
    user_instructions: 'Paste the article. Grounded returns posts shaped for X (≤280 chars), LinkedIn, and Instagram — each with its own voice. Pick what fits.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'drafter', config: { task_type: 'social_copy', num_drafts: '2', target_platform: 'twitter', tone: 'punchy' }, position: { x: 80, y: 40 } },
        { id: 'n2', agent_slug: 'drafter', config: { task_type: 'social_copy', num_drafts: '2', target_platform: 'linkedin', tone: 'explanatory' }, position: { x: 80, y: 220 } },
        { id: 'n3', agent_slug: 'drafter', config: { task_type: 'social_copy', num_drafts: '2', target_platform: 'instagram', tone: 'conversational' }, position: { x: 80, y: 400 } },
      ],
      edges: [],
      inputs: [
        { name: 'articleText', to: { node: 'n1', field: 'articleText' } },
        { name: 'articleText', to: { node: 'n2', field: 'articleText' } },
        { name: 'articleText', to: { node: 'n3', field: 'articleText' } },
      ],
      output: { node: 'n1', field: 'result' },
    },
  },

  // ─── Delivery ──────────────────────────────────────────────────────────
  {
    slug: 'newsletter-blurb',
    title: 'Write the newsletter blurb',
    description: 'Standfirst-style summary for the next newsletter send.',
    problem_statement: 'Producing newsletter copy from each story takes longer than it should, especially under deadline.',
    problem_category: 'Delivery',
    user_instructions: 'Paste the story. Grounded returns a newsletter blurb (~100 words) with a click-through hook.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'drafter', config: { task_type: 'newsletter', num_drafts: '2', tone: 'conversational', length: 'medium' }, position: { x: 80, y: 80 } },
      ],
      edges: [],
      inputs: [{ name: 'articleText', to: { node: 'n1', field: 'articleText' } }],
      output: { node: 'n1', field: 'result' },
    },
  },

  // ─── Revenue ──────────────────────────────────────────────────────────
  {
    slug: 'donor-report-draft',
    title: 'Draft a donor report from impact metrics',
    description: 'Convert this quarter\'s coverage and metrics into a draft funder report.',
    problem_statement: 'Donor reporting steals editorial time at quarter-end and rarely uses the strongest impact stories.',
    problem_category: 'Revenue',
    user_instructions: 'Paste the period\'s headline coverage + any impact metrics you have. Grounded returns a draft donor report mapped to a typical funder structure. Fundraiser agent will pick this up for funder-specific templates later.',
    definition: { nodes: [], edges: [], inputs: [], output: { node: '', field: '' } },
  },

  // ─── Editorial operations ─────────────────────────────────────────────
  {
    slug: 'freelancer-brief',
    title: 'Brief a freelancer with archive context',
    description: 'Send a freelancer a brief that includes your prior coverage, so they don\'t reinvent it.',
    problem_statement: 'Freelancer briefs go out without your archive context — work duplicates, angles get missed.',
    problem_category: 'Editorial operations',
    user_instructions: 'Type the brief topic. Grounded pulls relevant past coverage from your archive and drafts a brief that frames the story against what you\'ve already published.',
    definition: {
      nodes: [
        { id: 'n1', agent_slug: 'archivist', config: { top_k: '5' }, position: { x: 80, y: 80 } },
        { id: 'n2', agent_slug: 'drafter', config: { task_type: 'newsletter', num_drafts: '1', tone: 'explanatory', length: 'long' }, position: { x: 380, y: 80 } },
      ],
      edges: [
        { from: { node: 'n1', field: 'archiveContext' }, to: { node: 'n2', field: 'articleText' } },
      ],
      inputs: [{ name: 'query', to: { node: 'n1', field: 'query' } }],
      output: { node: 'n2', field: 'result' },
    },
  },
];

module.exports = { STARTERS, EMPTY_DEFINITION };
