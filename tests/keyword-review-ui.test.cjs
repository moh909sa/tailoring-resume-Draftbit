const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const React = require("react");
const { makeReview } = require("./fixtures/tailoring-review.cjs");
const root = path.resolve(__dirname, "..");
function loadSource(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const result = ts.transpileModule(source, {
    fileName: relative,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  assert.equal(result.diagnostics.length, 0);
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) {
      const base = name.slice(2);
      return loadSource(
        base + (fs.existsSync(path.join(root, base + ".ts")) ? ".ts" : ".tsx"),
        mocks,
      );
    }
    return require(name);
  };
  new Function("require", "module", "exports", result.outputText)(
    localRequire,
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const warnings = loadSource("lib/tailoring/warnings.ts");
const grounding =
  "GROUNDING_REVIEW_REQUIRED: Review workExperience[0].description[1] against the source resume.";
test("grounding warnings stay intact, appear in Changes and Save with human locations", () => {
  const original = [grounding, "Check all qualifications."];
  assert.deepEqual(warnings.reviewWarningsForStep(original, 0), [original[1]]);
  for (const step of [1]) {
    const messages = warnings.reviewWarningsForStep(original, step);
    assert.match(messages[0], /bullet 2 in work experience 1/);
    assert.match(messages[0], /original CV/);
    assert.match(messages[0], /Only keep claims you can support/);
    assert.doesNotMatch(messages[0], /GROUNDING|workExperience\[/);
    assert.equal(messages[1], original[1]);
  }
  assert.equal(original[0], grounding);
  const unknown = warnings.readableReviewWarning(
    "GROUNDING_REVIEW_REQUIRED: A new source location",
  );
  assert.match(unknown, /verify the experience changes against your original CV/);
  assert.doesNotMatch(unknown, /highlighted|GROUNDING/);
});

function nodes(element) {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}
function text(element) {
  if (element == null || typeof element === "boolean") return "";
  if (Array.isArray(element)) return element.map(text).join("");
  if (typeof element !== "object") return String(element);
  return text(element.props?.children);
}
const theme = { colors: { primary: "purple", border: "gray", mutedForeground: "silver" } };
const primitivesMocks = {
  react: { ...React, useMemo: (fn) => fn() },
  "react-native": { Pressable: "Pressable", View: "View" },
  "@/components/ui/text": { Text: "Text" },
  "@/lib/icons/LucideIcon": { __esModule: true, default: "Icon" },
  "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  "@/theming/ThemeProvider": { useTheme: () => ({ theme }) },
};
const primitives = loadSource("components/tailoring/ReviewPrimitives.tsx", primitivesMocks);
const previewContent = loadSource("components/tailoring/ReviewContent.tsx", primitivesMocks);
const changesUi = loadSource("lib/tailoring/changes.ts", primitivesMocks);

test("keyword toggles retain stable classes, checked state and visible selection on repeated presses", () => {
  const selected = new Set();
  const classes = new Map();
  for (const keyword of ["OPC-UA", "PLC", "Python", "OPC-UA", "PLC", "OPC-UA", "Python", "PLC"]) {
    const render = () =>
      primitives.KeywordOption({
        keyword,
        attestation: keyword === "OPC-UA",
        selected: selected.has(keyword),
        disabled: false,
        onPress: () => (selected.has(keyword) ? selected.delete(keyword) : selected.add(keyword)),
      });
    const before = render();
    before.props.onPress();
    const after = render();
    assert.equal(after.props.accessibilityRole, "checkbox");
    assert.equal(after.props.accessibilityState.checked, selected.has(keyword));
    assert.equal(after.props.className, before.props.className);
    const classList = nodes(after).map((node) => node.props.className);
    if (classes.has(keyword)) assert.deepEqual(classList, classes.get(keyword));
    classes.set(keyword, classList);
    assert.equal(after.props.style.borderColor, selected.has(keyword) ? "purple" : "gray");
    const check = nodes(after).find((node) => node.props.name === "Check");
    assert.equal(check.props.style.opacity, selected.has(keyword) ? 1 : 0);
  }
  assert.deepEqual([...selected].sort(), ["OPC-UA", "PLC"]);
  const disabled = primitives.KeywordOption({
    keyword: "OPC-UA",
    attestation: true,
    selected: true,
    disabled: true,
    onPress: () => {},
  });
  assert.equal(disabled.props.disabled, true);
  assert.equal(disabled.props.accessibilityState.disabled, true);
});

function screenHarness() {
  const effects = [];
  const navigation = [];
  const preview = makeReview();
  preview.review.keyword_options.supported = Array.from(
    { length: 40 },
    (_, i) => `Existing ${i + 1}`,
  );
  preview.review.keyword_options.needs_attestation = Array.from(
    { length: 35 },
    (_, i) => `Confirm ${i + 1}`,
  );
  preview.review.keyword_options.supported.push("EXISTING 1", "existing 40");
  preview.review.keyword_options.needs_attestation.push("confirm 35", "EXISTING 1");
  preview.review.warnings = [grounding, "2 change(s) rejected during verification"];
  const run = {
    preview,
    step: 0,
    status: "success",
    hydrating: false,
    reviewActivity: null,
    selectedKeywords: [],
    confirmCalls: 0,
    confirm: () => {
      run.confirmCalls++;
    },
    setStep: (step) => {
      run.step = step;
    },
    toggleKeyword: (keyword, attested) => {
      const index = run.selectedKeywords.findIndex((item) => item.keyword === keyword);
      if (index >= 0) run.selectedKeywords.splice(index, 1);
      else run.selectedKeywords = [...run.selectedKeywords, { keyword, attested }];
    },
  };
  const stateValues = [];
  let stateIndex = 0;
  const mocks = {
    ...primitivesMocks,
    react: {
      ...React,
      useCallback: (fn) => fn,
      useEffect: (fn) => {
        effects.push(fn);
      },
      useRef: () => ({ current: null }),
      useState: (init) => {
        const index = stateIndex++;
        if (!(index in stateValues))
          stateValues[index] = typeof init === "function" ? init() : init;
        return [
          stateValues[index],
          (value) => {
            stateValues[index] = typeof value === "function" ? value(stateValues[index]) : value;
          },
        ];
      },
    },
    "expo-router": {
      router: { replace: (route) => navigation.push(route), canGoBack: () => false },
      Stack: { Screen: "StackScreen" },
      useFocusEffect: () => {},
      useLocalSearchParams: () => ({}),
    },
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      BackHandler: { addEventListener: () => ({ remove() {} }) },
      FlatList: "FlatList",
      View: "View",
    },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "@/components/layout/AppScreen": { AppScreen: "AppScreen" },
    "@/components/layout/ScreenHeader": { ScreenHeader: "ScreenHeader" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/cv/Notice": { Notice: "Notice" },
    "@/components/tailoring/ReviewContent": {
      reviewItems: previewContent.reviewItems,
      ReviewContent: "ReviewContent",
    },
    "@/components/tailoring/ReviewPrimitives": primitives,
    "@/lib/auth/AuthProvider": {
      useAuth: () => ({ session: { user: { id: "test-owner" } }, loading: false }),
    },
    "@/lib/tailoring/TailoringProvider": { useTailoring: () => run },
  };
  const Screen = loadSource("app/tailoring/review.tsx", mocks).default;
  return {
    run,
    navigation,
    flushEffects: () => effects.splice(0).forEach((fn) => fn()),
    render: () => {
      stateIndex = 0;
      return Screen();
    },
  };
}
test("all 75 returned suggestions share one list; selections persist and Continue opens Changes", () => {
  const { run, render } = screenHarness();
  let screen = render();
  let list = nodes(screen).find((node) => node.type === "FlatList");
  const keywords = list.props.data.filter((item) => item.kind === "keyword");
  assert.equal(keywords.length, 75, "30 is an application limit, never a list page size");
  assert.equal(keywords.at(-1).keyword, "Confirm 35");
  const safety = list.props.data.filter((item) => item.kind === "warning");
  assert.equal(safety.length, 1);
  assert.match(safety[0].message, /Only select skills you really have/);
  assert.equal(list.props.data.find((item) => item.id === "attestation-heading").body, "");
  assert.equal(new Set(keywords.map((item) => item.keyword.toLowerCase())).size, 75);
  assert.equal(
    run.preview.review.keyword_options.supported.length,
    42,
    "display deduplication never alters server options",
  );
  assert.ok(!nodes(screen).some((node) => node.type === "Button" && text(node) === "Skip"));
  const header = text(list.props.ListHeaderComponent);
  assert.doesNotMatch(header, /30 total|keywords can still|Only select skills/);
  assert.match(header, /Some job keywords are missing from your CV/);
  for (const name of ["Existing 1", "Confirm 35", "Confirm 2", "Confirm 35", "Confirm 35"]) {
    list = nodes(render()).find((node) => node.type === "FlatList");
    const item = list.props.data.find((item) => item.kind === "keyword" && item.keyword === name);
    const option = list.props.renderItem({ item }).props.children;
    assert.equal(option.type, primitives.KeywordOption);
    option.props.onPress();
  }
  screen = render();
  assert.ok(
    nodes(screen).some((node) => node.type === "Text" && text(node) === "Apply Keywords (3)"),
  );
  assert.equal(run.selectedKeywords.find((item) => item.keyword === "Confirm 35").attested, true);
  assert.equal(run.selectedKeywords.find((item) => item.keyword === "Existing 1").attested, false);
  const continueButton = nodes(screen).find(
    (node) => node.type === "Button" && text(node) === "Continue to Changes",
  );
  assert.equal(continueButton.props.disabled, true);
  continueButton.props.onPress();
  assert.equal(run.step, 0);
  for (const item of [...run.selectedKeywords]) run.toggleKeyword(item.keyword, item.attested);
  const ready = nodes(render()).find(
    (node) => node.type === "Button" && text(node) === "Continue to Changes",
  );
  assert.equal(ready.props.disabled, false);
  ready.props.onPress();
  assert.equal(run.step, 1);
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(
    list.props.data.some(
      (item) => item.kind === "warning" && /bullet 2 in work experience 1/.test(item.message),
    ),
  );
  assert.equal(run.selectedKeywords.length, 0);
  assert.ok(
    list.props.data.some(
      (item) => item.kind === "warning" && /2 suggested changes were excluded/.test(item.message),
    ),
  );
});

test("pending Incident management and Technical documentation gate Continue until applied or deselected", () => {
  const { run, render } = screenHarness();
  run.preview.review.keyword_options.supported = [];
  run.preview.review.keyword_options.needs_attestation = [
    "Incident management",
    "Technical documentation",
  ];
  const button = (screen, label) =>
    nodes(screen).find(
      (node) =>
        node.type === "Button" && (node.props.accessibilityLabel === label || text(node) === label),
    );
  const toggle = (name) => {
    const list = nodes(render()).find((node) => node.type === "FlatList");
    list.props
      .renderItem({
        item: list.props.data.find((item) => item.kind === "keyword" && item.keyword === name),
      })
      .props.children.props.onPress();
  };
  assert.equal(button(render(), "Continue to Changes").props.disabled, false);
  toggle("Incident management");
  toggle("Technical documentation");
  let screen = render();
  assert.equal(button(screen, "Apply Keywords (2)").props.disabled, false);
  assert.equal(button(screen, "Continue to Changes").props.disabled, true);
  assert.match(text(screen), /Apply your selected keywords or deselect them to continue\./);
  button(screen, "Continue to Changes").props.onPress();
  assert.equal(run.step, 0);
  run.reviewActivity = "keywords";
  screen = render();
  assert.equal(button(screen, "Apply Keywords (2)").props.disabled, true);
  assert.equal(button(screen, "Continue to Changes").props.disabled, true);
  // A successful response clears pending selections; request completion still gates navigation.
  run.selectedKeywords = [];
  assert.equal(button(render(), "Continue to Changes").props.disabled, true);
  run.reviewActivity = null;
  assert.equal(button(render(), "Continue to Changes").props.disabled, false);
  assert.equal(run.step, 0);
  // A failed apply leaves pending selections available for retry.
  toggle("Incident management");
  toggle("Technical documentation");
  run.reviewProblem = {
    severity: "error",
    kind: "retry",
    message: "Apply failed. Your selections are preserved.",
  };
  screen = render();
  assert.equal(button(screen, "Continue to Changes").props.disabled, true);
  assert.equal(button(screen, "Apply Keywords (2)").props.disabled, false);
  toggle("Incident management");
  assert.equal(button(render(), "Continue to Changes").props.disabled, true);
  toggle("Technical documentation");
  assert.equal(button(render(), "Continue to Changes").props.disabled, false);
  assert.doesNotMatch(
    text(render()),
    /Apply your selected keywords or deselect them to continue\./,
  );
});

test("only skill attestation uses a warning card; other review notes stay neutral with recovery actions", () => {
  const { run, render } = screenHarness();
  run.preview.review.warnings.push("Some details need checking against your original CV.");
  const snapshot = JSON.stringify(run.preview);
  for (const step of [0, 1]) {
    run.step = step;
    const list = nodes(render()).find((node) => node.type === "FlatList");
    for (const item of list.props.data.filter((item) => item.kind === "warning")) {
      const note = list.props.renderItem({ item }).props.children;
      assert.equal(
        note.type,
        item.id === "attestation-safety" ? primitives.SafetyNote : primitives.ReviewNote,
      );
      const rendered = note.type(note.props);
      assert.equal(text(rendered), item.message);
      if (item.id !== "attestation-safety") {
        assert.ok(!nodes(rendered).some((node) => node.type === "Icon"));
        assert.ok(
          !nodes(rendered).some((node) =>
            /bg-warning|border-warning/.test(node.props.className ?? ""),
          ),
        );
      }
    }
  }
  assert.equal(JSON.stringify(run.preview), snapshot);
  run.step = 0;
  run.reviewProblem = {
    severity: "info",
    kind: "retry",
    message: "Connection lost. Your draft is preserved.",
  };
  let screen = render();
  let list = nodes(screen).find((node) => node.type === "FlatList");
  assert.ok(
    nodes(list.props.ListHeaderComponent).some(
      (node) =>
        node.type === primitives.ReviewNote && node.props.message === run.reviewProblem.message,
    ),
  );
  assert.ok(
    nodes(screen)
      .concat(nodes(list.props.ListHeaderComponent))
      .some(
        (node) => node.type === "Button" && text(node) === "Reload review" && !node.props.disabled,
      ),
  );
  run.reviewProblem = { severity: "info", kind: "expired", message: "Preview expired" };
  run.input = { resumeId: "source", jobDescription: "Saved input" };
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(
    nodes(list.props.ListHeaderComponent).some(
      (node) =>
        node.type === primitives.ReviewNote && /preview has expired/.test(node.props.message),
    ),
  );
  assert.ok(
    nodes(list.props.ListHeaderComponent).some(
      (node) => node.type === "Button" && text(node) === "Create new preview",
    ),
  );
});

test("failed review actions use Notice while successful retry-kind reloads stay informational", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  let reloads = 0;
  run.reloadReview = () => {
    reloads++;
  };
  const message = "The save could not be confirmed. Your draft is preserved.";
  run.reviewProblem = { kind: "retry", severity: "error", message };
  const draft = JSON.stringify(run.preview);
  let list = nodes(render()).find((node) => node.type === "FlatList");
  let header = nodes(list.props.ListHeaderComponent);
  assert.ok(
    header.some(
      (node) =>
        node.type === "Notice" && node.props.tone === "error" && node.props.message === message,
    ),
  );
  header.find((node) => node.type === "Button" && text(node) === "Reload review").props.onPress();
  assert.equal(reloads, 1);
  // Same kind and identical copy: severity comes from the outcome, not the words.
  run.reviewProblem = { kind: "retry", severity: "info", message };
  list = nodes(render()).find((node) => node.type === "FlatList");
  header = nodes(list.props.ListHeaderComponent);
  assert.ok(
    header.some((node) => node.type === primitives.ReviewNote && node.props.message === message),
  );
  assert.ok(!header.some((node) => node.type === "Notice"));
  assert.equal(JSON.stringify(run.preview), draft);
  run.tailoringId = run.preview.tailoring_id;
  run.preview = null;
  run.reviewProblem = { kind: "retry", severity: "error", message: "Review load failed." };
  const missing = nodes(render());
  assert.ok(missing.some((node) => node.type === "Notice" && node.props.tone === "error"));
  assert.ok(
    missing.some((node) => node.type === "Button" && text(node) === "Retry loading review"),
  );
});

test("verification rejection summaries use friendly copy outside Keywords without hiding other warnings", () => {
  for (const count of [1, 7]) {
    const summary = `${count} change(s) rejected during verification`;
    const messages = [summary, "Please check your qualifications."];
    assert.deepEqual(warnings.reviewWarningsForStep(messages, 0), [messages[1]]);
    for (const step of [1]) {
      assert.equal(
        warnings.reviewWarningsForStep(messages, step)[0],
        `${count} suggested ${count === 1 ? "change was" : "changes were"} excluded during verification. Check the updated text before saving.`,
      );
    }
    assert.equal(messages[0], summary);
    assert.equal(
      warnings.isRejectedChangeSummary(`  ${count} CHANGE(S) REJECTED DURING VERIFICATION  `),
      true,
    );
  }
  const other = "Verification failed. Reload before continuing.";
  assert.deepEqual(warnings.reviewWarningsForStep([other], 0), [other]);
});

test("summary cards keep primary metrics and only positive optional counts", () => {
  const summary = {
    skills_added: 0,
    descriptions_modified: 0,
    skills_removed: 0,
    certifications_added: 0,
    high_risk_changes: 6,
  };
  let cards = primitives.ChangeSummaryCards({ summary });
  assert.match(text(cards), /Skills Added/);
  assert.match(text(cards), /Descriptions Modified/);
  assert.doesNotMatch(text(cards), /Skills Removed|Certifications Added|High Risk Changes/);
  summary.skills_removed = 2;
  summary.certifications_added = 3;
  cards = primitives.ChangeSummaryCards({ summary });
  assert.match(text(cards), /2Skills Removed/);
  assert.match(text(cards), /3Certifications Added/);
  assert.equal(nodes(cards).filter((node) => node.props.className?.includes("w-[48%]")).length, 4);
  summary.skills_removed = null;
  summary.certifications_added = null;
  assert.doesNotMatch(
    text(primitives.ChangeSummaryCards({ summary })),
    /Skills Removed|Certifications Added/,
  );
});

test("simplified Changes preserves individual risks, dynamic counts and unmatched warnings", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  let list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(!list.props.data.some((item) => item.id === "verification-toggle"));
  for (const [section, title] of [
    ["summary", "Summary Changes"],
    ["skill", "Skills Changes"],
    ["description", "Description Changes"],
  ]) {
    const accordion = list.props.data.find((item) => item.section === section);
    assert.equal(accordion.title, title);
    assert.ok(
      accordion.subtitle.startsWith(
        String(
          run.preview.review.change_sections.find((item) => item.type === section).items.length,
        ),
      ),
    );
  }
  // Every original comparison, including high-risk ones, is still expandable.
  for (const section of run.preview.review.change_sections) {
    list = nodes(render()).find((node) => node.type === "FlatList");
    const accordion = list.props.data.find((item) => item.section === section.type);
    if (section.type !== "summary")
      list.props.renderItem({ item: accordion }).props.children.props.onPress();
  }
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.deepEqual(
    list.props.data
      .filter((item) => item.kind === "change" || item.kind === "skill-added")
      .map((item) => item.change),
    run.preview.review.change_sections.flatMap((section) => section.items),
  );
  assert.ok(
    list.props.data.some(
      (item) => item.kind === "warning" && /bullet 2 in work experience 1/.test(item.message),
    ),
  );
  assert.ok(!list.props.data.some((item) => item.id === "resume-toggle"));
  run.step = 1;
  const saveList = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(!saveList.props.data.some((item) => item.id === "resume-heading"));
  assert.ok(
    !saveList.props.data.some(
      (item) => item.id === "resume-toggle" || item.id === "save-review-toggle",
    ),
  );
  run.step = 1;
  // A warning with an exact comparison path belongs beside that comparison.
  const target = run.preview.review.change_sections.find(
    (section) => section.type === "description",
  ).items[0];
  run.preview.review.warnings.push(`Check ${target.field_path} against your original CV.`);
  list = nodes(render()).find((node) => node.type === "FlatList");
  const changeIndex = list.props.data.findIndex((item) => item.change === target);
  assert.equal(list.props.data[changeIndex + 1].message, run.preview.review.warnings.at(-1));
  run.preview.review.change_sections = [];
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(list.props.data.some((item) => item.id === "verification-unavailable"));
  assert.ok(list.props.data.some((item) => item.message === run.preview.review.warnings.at(-1)));
  run.preview.review.change_summary.high_risk_changes = 0;
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(!list.props.data.some((item) => item.id === "verification-unavailable"));
});

test("Summary comparisons strike the complete original and highlight only additions assigned to Summary", () => {
  const original =
    "Built devices and systems.\n\n" +
    "Maintained reliable equipment across multiple sites. ".repeat(25);
  const updated =
    "Built automation and systems.\n\n" +
    "Maintained reliable equipment across multiple sites. ".repeat(25);
  const change = {
    field_type: "summary",
    field_path: "summary",
    change_type: "modified",
    confidence: "medium",
    original_value: original,
    new_value: updated,
  };
  const comparison = primitives.ChangeComparison({
    change,
    summaryComparison: true,
    appliedKeywords: ["automation"],
  });
  const sections = nodes(comparison).filter(
    (node) => node.type === "View" && node.props.className?.includes("border-l-2"),
  );
  const before = nodes(sections[0]).find((node) => node.type === "Text" && node.props.selectable);
  const after = nodes(sections[1]).find((node) => node.type === "Text" && node.props.selectable);
  assert.equal(text(before), original);
  assert.equal(text(after), updated);
  assert.ok(before.props.className.includes("line-through"));
  assert.ok(before.props.className.includes("text-destructive"));
  assert.doesNotMatch(text(comparison), /Modified wording/);
  assert.ok(
    nodes(after).some(
      (node) =>
        text(node).includes("automation") && node.props.className?.includes("text-tertiary"),
    ),
  );
  assert.ok(
    nodes(after).some(
      (node) => node.props.className === "text-foreground" && text(node).includes("Maintained"),
    ),
  );
  assert.ok(!nodes(after).some((node) => /underline|bg-/.test(node.props.className ?? "")));
  // Existing Skills/Descriptions styling does not acquire whole-paragraph deletion.
  const other = primitives.ChangeComparison({ change: { ...change, field_type: "description" } });
  const otherBefore = nodes(other).find((node) => node.type === "Text" && node.props.selectable);
  assert.ok(
    nodes(otherBefore).some(
      (node) =>
        node !== otherBefore && node.props.className === "" && text(node).includes("Maintained"),
    ),
  );
});

test("connected accordions keep compact skill additions without altering verification data", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  let list = nodes(render()).find((node) => node.type === "FlatList");
  for (const type of ["skill", "description"]) {
    list.props
      .renderItem({ item: list.props.data.find((item) => item.section === type) })
      .props.children.props.onPress();
    list = nodes(render()).find((node) => node.type === "FlatList");
  }
  for (const type of ["summary", "skill", "description"]) {
    const group = list.props.data.filter((item) => item.connected === type);
    assert.ok(group.length > 1);
    const firstIndex = list.props.data.indexOf(group[0]);
    assert.deepEqual(list.props.data.slice(firstIndex, firstIndex + group.length), group);
    for (let index = 0; index < group.length; index++) {
      const row = list.props.renderItem({ item: group[index] });
      assert.ok(row.props.className.includes("border-x"));
      assert.equal(row.props.className.includes("mb-3"), index === group.length - 1);
      if (index === 0) {
        assert.ok(row.props.className.includes("rounded-t-2xl"));
        assert.equal(row.props.children.props.embedded, true);
      }
      if (index === group.length - 1) assert.ok(row.props.className.includes("rounded-b-2xl"));
    }
  }
  const skill = list.props.data.find((item) => item.kind === "skill-added");
  const skillContent = list.props.renderItem({ item: skill }).props.children;
  assert.equal(text(skillContent), skill.change.new_value);
  assert.ok(nodes(skillContent).some((node) => node.props.className?.includes("text-success")));
  assert.doesNotMatch(text(skillContent), /Before|After|High risk|Verify this claim/);
  assert.ok(
    list.props.data.some((item) => item.kind === "change" && item.change.change_type === "removed"),
  );
  run.preview.review.warnings.push("Check additional.technicalSkills against your original CV.");
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(list.props.data.some((item) => item.message === run.preview.review.warnings.at(-1)));
  // Closing a section leaves a single fully rounded header.
  list.props
    .renderItem({ item: list.props.data.find((item) => item.section === "skill") })
    .props.children.props.onPress();
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(
    list.props.data
      .filter((item) => item.connected === "skill")
      .every((item) => item.kind === "section" || item.kind === "warning"),
  );
  run.step = 1;
  const saveList = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(!saveList.props.data.some((item) => item.kind === "resume"));
  assert.ok(
    !saveList.props.data.some(
      (item) => item.id === "resume-toggle" || item.id === "save-review-toggle",
    ),
  );
  assert.equal(
    run.preview.review.warnings.at(-1),
    "Check additional.technicalSkills against your original CV.",
  );
  assert.equal(skill.change.confidence, "high");
});

test("description cards strike the entire wrapped original and keep wording-only After plain", () => {
  const change = {
    field_type: "description",
    field_path: "workExperience[0].description[0]",
    change_type: "modified",
    confidence: "medium",
    original_value:
      "Provided support using documented processes.\n" + "Kept production reliable. ".repeat(30),
    new_value:
      "Provided support with documented processes.\n" + "Kept production reliable. ".repeat(30),
  };
  const comparison = primitives.ChangeComparison({
    change,
    descriptionComparison: true,
    embedded: true,
    appliedKeywords: [],
  });
  assert.ok(comparison.props.className.includes("rounded-xl"));
  const values = nodes(comparison).filter((node) => node.type === "Text" && node.props.selectable);
  assert.equal(text(values[0]), change.original_value);
  assert.ok(values[0].props.className.includes("text-destructive"));
  assert.ok(values[0].props.className.includes("line-through"));
  assert.equal(text(values[1]), change.new_value);
  for (const node of nodes(values[1]))
    assert.doesNotMatch(node.props.className ?? "", /underline|line-through|text-tertiary|bg-/);
});

test("Changes combines both keyword rounds and all confirmed locations once without mutating the draft", () => {
  const first = "System integration concepts";
  const second = "Desktop and laptop support";
  const { run, render } = screenHarness();
  run.step = 1;
  run.preview = makeReview("round-1", 76, [first]);
  run.preview.review.keyword_placements = [{ keyword: first, paths: ["summary"] }];
  run.step = 0;
  const originalDraft = JSON.stringify(run.preview);
  const keywordScreen = render();
  const keywordList = nodes(keywordScreen).find((node) => node.type === "FlatList");
  assert.ok(
    !keywordList.props.data.some((item) => item.id === "placements" || item.kind === "placement"),
  );
  assert.ok(!keywordList.props.data.some((item) => item.title === "Keywords in this draft"));
  assert.ok(
    nodes(keywordScreen).some(
      (node) =>
        node.type === "Button" && /Apply Keywords/.test(node.props.accessibilityLabel ?? ""),
    ),
  );
  nodes(keywordScreen)
    .find((node) => node.type === "Button" && text(node) === "Continue to Changes")
    .props.onPress();
  assert.equal(run.step, 1);
  assert.equal(JSON.stringify(run.preview), originalDraft);
  const destinations = () => {
    const list = nodes(render()).find((node) => node.type === "FlatList");
    const component = nodes(list.props.ListHeaderComponent).find(
      (node) => node.type === primitives.KeywordDestinations,
    );
    return primitives.KeywordDestinationsCard({
      ...component.props,
      expanded: true,
      onToggle: () => {},
    });
  };
  assert.match(text(destinations()), /System integration conceptsSummary/);
  run.preview = makeReview("round-2", 79, [first, second]);
  run.preview.review.keyword_placements = [
    { keyword: first, paths: ["summary"] },
    { keyword: second, paths: ["additional.technicalSkills[2]"] },
    {
      keyword: second.toUpperCase(),
      paths: [
        "workExperience[0].description[0]",
        "additional.technicalSkills[2]",
        "workExperience[1].description[0]",
      ],
    },
  ];
  const snapshot = JSON.stringify(run.preview);
  const rows = changesUi.keywordDestinations(
    run.preview.review.keyword_options.applied,
    run.preview.review.keyword_placements,
    run.preview.preview.resume_preview,
  );
  assert.deepEqual(rows, [
    { keyword: first, locations: ["Summary"] },
    { keyword: second, locations: ["Skills", "Work Experience"] },
  ]);
  assert.match(text(destinations()), /Desktop and laptop supportSkillsWork Experience/);
  assert.equal(JSON.stringify(run.preview), snapshot);
  run.preview.review.keyword_placements = [];
  assert.match(text(destinations()), /No confirmed location returned/);
  assert.doesNotMatch(text(destinations()), /Skills · Work Experience/);
});

test("description list removes company headings, retaining paired bullets and warnings through Back and Continue", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  const original = run.preview.review.change_sections.find(
    (section) => section.type === "description",
  ).items[0];
  const otherRole = { ...original, field_path: "workExperience[1].description[0]" };
  const anotherBullet = { ...original, field_path: "workExperience[0].description[1]" };
  run.preview.preview.resume_preview.workExperience.push({
    title: "Support Engineer",
    company: "Another employer",
  });
  run.preview.review.change_sections.find((section) => section.type === "description").items = [
    original,
    otherRole,
    anotherBullet,
  ];
  const listFor = () => nodes(render()).find((node) => node.type === "FlatList");
  let list = listFor();
  list.props
    .renderItem({ item: list.props.data.find((item) => item.section === "description") })
    .props.children.props.onPress();
  list = listFor();
  assert.deepEqual(
    list.props.data.filter((item) => item.kind === "description-group").map((item) => item.title),
    [],
  );
  assert.deepEqual(
    list.props.data.filter((item) => item.descriptionComparison).map((item) => item.change),
    [original, otherRole, anotherBullet],
  );
  assert.ok(
    list.props.data.some((item) => item.kind === "warning" && /bullet 2/.test(item.message)),
  );
  let screen = render();
  const button = (label) =>
    nodes(screen).find((node) => node.type === "Button" && text(node) === label);
  button("Back").props.onPress();
  assert.equal(run.step, 0);
  screen = render();
  button("Continue to Changes").props.onPress();
  assert.equal(run.step, 1);
  screen = render();
  button("Continue to Edit CV").props.onPress();
  assert.equal(run.step, 1);
  assert.equal(run.confirmCalls, 1);
});

test("description After highlights added applied phrases only and has no generic diff styling", () => {
  const change = {
    field_type: "description",
    field_path: "workExperience[0].description[0]",
    change_type: "modified",
    confidence: "high",
    original_value: "Provided Desktop support using documented processes.",
    new_value: "Provided Desktop and laptop support with documented processes.",
  };
  const comparison = primitives.ChangeComparison({
    change,
    descriptionComparison: true,
    appliedKeywords: ["Desktop and laptop support"],
  });
  const values = nodes(comparison).filter((node) => node.type === "Text" && node.props.selectable);
  assert.equal(text(values[0]), change.original_value);
  assert.equal(text(values[1]), change.new_value);
  assert.doesNotMatch(text(comparison), /Modified wording|Work Experience 1|Description 1/);
  assert.match(text(comparison), /Before|After|Verify accuracy/);
  const blue = nodes(values[1])
    .filter((node) => node !== values[1] && node.props.className?.includes("text-tertiary"))
    .map(text)
    .join("");
  assert.equal(blue, "Desktop and laptop support");
  assert.ok(
    nodes(values[1]).some(
      (node) => text(node).includes("with") && node.props.className === "text-foreground",
    ),
  );
  assert.ok(
    nodes(values[0]).some(
      (node) => text(node).includes("using") && node.props.className?.includes("line-through"),
    ),
  );
  assert.ok(
    nodes(values[0]).some(
      (node) =>
        text(node).includes("documented processes") &&
        node.props.className.includes("line-through"),
    ),
  );
  const parts = [{ text: "Use C++ and PLCs; PLC and OPC-UA.", changed: false }];
  const marked = changesUi.highlightAppliedKeywords(parts, ["C++", "PLC", "OPC-UA"]);
  assert.equal(marked.map((part) => part.text).join(""), parts[0].text);
  assert.equal(
    marked
      .filter((part) => part.keyword)
      .map((part) => part.text)
      .join("|"),
    "C++|PLC|OPC-UA",
  );
});

test("description keyword highlights require a matching current placement and an actual addition", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  const keyword = {
    field_type: "description",
    field_path: "workExperience[0].description[0]",
    change_type: "modified",
    confidence: "medium",
    original_value: "Supported networks.",
    new_value: "Supported LAN/WAN networks.",
  };
  const wording = {
    ...keyword,
    field_path: "workExperience[0].description[1]",
    original_value: "Supported LAN/WAN using documented processes.",
    new_value: "Supported LAN/WAN with documented processes.",
  };
  run.preview.review.change_sections.find((section) => section.type === "description").items = [
    keyword,
    wording,
  ];
  run.preview.review.keyword_placements = [
    { keyword: "LAN/WAN", paths: ["resume_preview.workExperience.0.description.0"] },
    { keyword: "documented processes", paths: ["workExperience[1].description[1]"] },
  ];
  assert.deepEqual(changesUi.keywordsForChange(keyword, run.preview.review.keyword_placements), [
    "LAN/WAN",
  ]);
  assert.deepEqual(changesUi.keywordsForChange(wording, run.preview.review.keyword_placements), []);
  assert.deepEqual(
    changesUi.keywordsForChange(
      { ...keyword, field_path: "workExperience[0].description[10]" },
      run.preview.review.keyword_placements,
    ),
    [],
  );
  let list = nodes(render()).find((node) => node.type === "FlatList");
  list.props
    .renderItem({ item: list.props.data.find((item) => item.section === "description") })
    .props.children.props.onPress();
  list = nodes(render()).find((node) => node.type === "FlatList");
  for (const item of list.props.data.filter((item) => item.descriptionComparison)) {
    const component = list.props.renderItem({ item }).props.children;
    const comparison = primitives.ChangeComparison(component.props);
    const after = nodes(comparison).filter(
      (node) => node.type === "Text" && node.props.selectable,
    )[1];
    const blue = nodes(after)
      .filter((node) => node.props.className?.includes("text-tertiary"))
      .map(text)
      .join("");
    assert.equal(blue, item.change === keyword ? "LAN/WAN" : "");
    assert.ok(!nodes(after).some((node) => /underline|bg-/.test(node.props.className ?? "")));
  }
  // Even a placement on the same bullet does not highlight a keyword already present before.
  const existing = primitives.ChangeComparison({
    change: wording,
    descriptionComparison: true,
    appliedKeywords: ["LAN/WAN"],
  });
  const after = nodes(existing).filter((node) => node.props.selectable)[1];
  assert.ok(!nodes(after).some((node) => node.props.className?.includes("text-tertiary")));
});

test("keyword card preserves latest scores and stacked placements with current-only fallback", () => {
  const preview = makeReview(
    "latest-round",
    63.3,
    ["System integration concepts", "Long keyword that wraps naturally"],
    [30.7, 56, 63.3],
  );
  const snapshot = JSON.stringify(preview);
  const render = (expanded = true) =>
    primitives.KeywordDestinationsCard({
      review: preview.review,
      resume: preview.preview.resume_preview,
      expanded,
      onToggle: () => {},
    });
  let box = render();
  assert.match(
    text(box),
    /ATS match score56 → 63.3\+7.3 ptsLatest keyword updateWhere your keywords went2 keywords/,
  );
  assert.ok(box.props.className.includes("bg-card"));
  for (const keyword of preview.review.keyword_options.applied) {
    const label = nodes(box).find((node) => node.type === "Text" && text(node) === keyword);
    assert.ok(label.props.className.includes("text-foreground"));
    assert.ok(label.props.className.includes("flex-1"));
    assert.equal(label.props.numberOfLines, undefined);
  }
  const badges = nodes(box).filter(
    (node) => node.props.className === "max-w-full rounded-md bg-secondary px-2 py-1",
  );
  assert.deepEqual(badges.map(text), ["Summary", "Skills", "Summary", "Skills"]);
  const scoreBlock = nodes(box).find((node) => node.props.accessibilityLiveRegion === "polite");
  assert.ok(
    nodes(scoreBlock).some(
      (node) => text(node) === "63.3" && node.props.className.includes("text-h1"),
    ),
  );
  assert.ok(
    nodes(scoreBlock).some(
      (node) => text(node) === "56" && node.props.className.includes("text-muted-foreground"),
    ),
  );
  assert.equal(JSON.stringify(preview), snapshot);
  preview.review.score_history = [63.3];
  const scoreText = () =>
    text(nodes(render()).find((node) => node.props.accessibilityLiveRegion === "polite"));
  assert.match(scoreText(), /ATS match score63.3/);
  assert.doesNotMatch(scoreText(), /→|pts/);
  preview.review.score_history = [30.7, 56];
  assert.doesNotMatch(scoreText(), /→|pts/);
  preview.review.ats_score.overall_score = 0;
  preview.review.score_history = [1, 0];
  assert.match(scoreText(), /ATS match score1 → 0/);
  assert.doesNotMatch(scoreText(), /pts/);
});

test("keyword disclosure starts collapsed, toggles full row accessibly, and leaves score and draft intact", () => {
  let state;
  const stateful = loadSource("components/tailoring/ReviewPrimitives.tsx", {
    ...primitivesMocks,
    react: {
      ...React,
      useMemo: (fn) => fn(),
      useState: (initial) => {
        if (state === undefined) state = initial;
        return [
          state,
          (next) => {
            state = typeof next === "function" ? next(state) : next;
          },
        ];
      },
    },
  });
  const preview = makeReview(
    "current",
    63.3,
    [
      "Networking fundamentals (LAN/WAN, TCP/IP, DNS, DHCP, VLANs, Wi-Fi)",
      "Desktop and laptop support",
    ],
    [56, 63.3],
  );
  const snapshot = JSON.stringify(preview);
  const render = () => {
    const element = stateful.KeywordDestinations({
      review: preview.review,
      resume: preview.preview.resume_preview,
    });
    return stateful.KeywordDestinationsCard(element.props);
  };
  for (const expanded of [false, true, false]) {
    const card = render();
    const disclosure = nodes(card).find((node) => node.type === "Pressable");
    assert.equal(disclosure.props.accessibilityRole, "button");
    assert.equal(disclosure.props.accessibilityState.expanded, expanded);
    assert.match(disclosure.props.accessibilityLabel, /2 keywords/);
    assert.ok(disclosure.props.className.includes("min-h-20"));
    assert.equal(
      nodes(card).some(
        (node) => node.type === "Text" && text(node) === "Desktop and laptop support",
      ),
      expanded,
    );
    assert.match(text(card), /56 → 63.3\+7.3 pts/);
    if (expanded)
      assert.ok(
        nodes(card).some((node) => node.props.className?.includes("w-28 shrink-0 items-end")),
      );
    disclosure.props.onPress();
  }
  assert.equal(JSON.stringify(preview), snapshot);
  state = undefined; // A fresh mount when entering Changes resets disclosure state.
  assert.equal(
    nodes(render()).find((node) => node.type === "Pressable").props.accessibilityState.expanded,
    false,
  );
});

test("Summary ignores keywords placed elsewhere and leaves wording-only edits plain", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  const change = run.preview.review.change_sections.find((section) => section.type === "summary")
    .items[0];
  change.original_value = "Worked using reliable systems.";
  change.new_value = "Worked with reliable automation systems.";
  run.preview.review.keyword_placements = [
    { keyword: "automation", paths: ["workExperience[0].description[0]"] },
  ];
  const list = nodes(render()).find((node) => node.type === "FlatList");
  const item = list.props.data.find((item) => item.summaryComparison);
  const comparisonComponent = list.props.renderItem({ item }).props.children;
  assert.deepEqual(comparisonComponent.props.appliedKeywords, []);
  const comparison = primitives.ChangeComparison(comparisonComponent.props);
  const after = nodes(comparison).filter((node) => node.props.selectable)[1];
  assert.equal(text(after), change.new_value);
  assert.ok(
    !nodes(after).some((node) => /underline|text-tertiary|bg-/.test(node.props.className ?? "")),
  );
});

test("Changes is step 2 of 2 and saves directly without the old repeated summary screen", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  const before = JSON.stringify(run.preview);
  const screen = render();
  const list = nodes(screen).find((node) => node.type === "FlatList");
  assert.match(text(list.props.ListHeaderComponent), /Step 2 of 2/);
  assert.ok(
    !list.props.data.some((item) => item.kind === "resume" || item.id === "resume-heading"),
  );
  assert.ok(
    !nodes(list.props.ListHeaderComponent).some((node) =>
      /^(Job Match|Changes Made|Keywords Applied):/.test(node.props.accessibilityLabel ?? ""),
    ),
  );
  assert.match(text(screen), /We’ll save a separate copy for you to edit\./);
  assert.ok(
    nodes(screen).some((node) => node.type === "Button" && text(node) === "Continue to Edit CV"),
  );
  assert.equal(
    primitives.ReviewStepper({ step: 1 }).props.accessibilityLabel,
    "Step 2 of 2: Changes",
  );
  assert.equal(JSON.stringify(run.preview), before);
});

test("Changes preserves Back, explicit save, loading, errors, expiration and acknowledgement", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  let calls = 0;
  run.confirm = () => {
    calls++;
  };
  let screen = render();
  let back = nodes(screen).find((node) => node.type === "Button" && text(node) === "Back");
  const draft = run.preview;
  back.props.onPress();
  assert.equal(run.step, 0);
  assert.equal(run.preview, draft);
  run.step = 1;
  screen = render();
  let confirm = nodes(screen).find(
    (node) => node.type === "Button" && text(node) === "Continue to Edit CV",
  );
  assert.equal(calls, 0);
  confirm.props.onPress();
  assert.equal(calls, 1);
  assert.doesNotMatch(text(render()), /Your tailored CV is saved/);
  run.reviewActivity = "confirm";
  screen = render();
  confirm = nodes(screen).find((node) => node.type === "Button" && text(node) === "Saving…");
  assert.equal(confirm.props.disabled, true);
  assert.ok(nodes(confirm).some((node) => node.type === "ActivityIndicator"));
  back = nodes(screen).find((node) => node.type === "Button" && text(node) === "Back");
  assert.equal(back.props.disabled, true);
  run.reviewActivity = null;
  run.reviewProblem = {
    severity: "error",
    kind: "retry",
    message: "The save could not be confirmed. Your draft is preserved.",
  };
  screen = render();
  const list = nodes(screen).find((node) => node.type === "FlatList");
  assert.ok(
    nodes(list.props.ListHeaderComponent).some(
      (node) =>
        node.type === "Notice" &&
        node.props.tone === "error" &&
        node.props.message === run.reviewProblem.message,
    ),
  );
  assert.equal(run.preview, draft);
  run.preview.review.preview_expires_at = "2020-01-01T00:00:00Z";
  screen = render();
  confirm = nodes(screen).find(
    (node) => node.type === "Button" && text(node) === "Continue to Edit CV",
  );
  assert.equal(confirm.props.disabled, true);
  run.saved = true;
  assert.match(text(render()), /Your tailored CV is saved/);
});

test("only a saved acknowledgement opens the editor using its confirmed CV ID", () => {
  const { run, render, flushEffects, navigation } = screenHarness();
  run.step = 1;
  run.preview.review.preview_expires_at = null;
  render();
  flushEffects();
  assert.deepEqual(navigation, []);
  run.reviewActivity = "confirm";
  render();
  flushEffects();
  assert.deepEqual(navigation, []);
  run.reviewActivity = null;
  run.saved = true;
  run.confirmation = {
    tailoring_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "ready",
    tailored_cv: {},
  };
  render();
  flushEffects();
  assert.deepEqual(navigation, [
    { pathname: "/cv-editor/[id]", params: { id: run.confirmation.tailoring_id } },
  ]);
});

test("resume ordering uses standards, retains unknown content and handles additional/custom containers", () => {
  const resume = {
    extraResearch: "Kept unknown research",
    additional: {
      languages: ["English"],
      certificationsTraining: ["Actual certification"],
      technicalSkills: ["PLC"],
      professionalSkills: ["Leadership"],
      awards: ["Actual award"],
    },
    personalProjects: [{ name: "Actual project", description: ["Real project details"] }],
    education: [{ degree: "Actual degree" }],
    workExperience: [
      { title: "Engineer", description: ["First bullet"] },
      { title: "Analyst", description: ["Second bullet"] },
    ],
    summary: "Complete original paragraph.\n\nSecond paragraph.",
    personalInfo: {
      github: "https://example.invalid/code",
      name: "Full Name",
      email: "name@example.invalid",
      title: "Engineer",
      phone: "123",
      location: "City",
      telegram: "@realcontact",
    },
    customSections: {
      community: { sectionType: "text", text: "Actual community work" },
      empty: { sectionType: "stringList", strings: [] },
    },
  };
  const before = JSON.stringify(resume);
  const items = previewContent.orderedResumeItems(resume);
  assert.deepEqual(
    items.map((item) => item.id),
    [
      "personalInfo",
      "summary",
      "workExperience0",
      "workExperience1",
      "education0",
      "additional.technicalSkills",
      "additional.professionalSkills",
      "additional.certificationsTraining",
      "personalProjects0",
      "additional.languages",
      "customSections.community",
      "extraResearch",
      "additional.awards",
    ],
  );
  assert.equal(items.find((item) => item.id === "workExperience1").continuation, true);
  assert.equal(items.find((item) => item.id === "workExperience0").continuation, false);
  assert.equal(items.find((item) => item.id === "summary").value, resume.summary);
  assert.equal(
    items.find((item) => item.id === "customSections.community").value,
    resume.customSections.community,
  );
  const profile = previewContent.ReviewContent({ item: items[0] });
  assert.match(
    text(profile),
    /^Full NameEngineername@example.invalid · 123 · City · https:\/\/example.invalid\/code/,
  );
  assert.ok(nodes(profile).some((node) => node.props.value?.telegram === "@realcontact"));
  assert.equal(JSON.stringify(resume), before);
});

test("explicit sectionMeta order and user section names survive while identity always stays first", () => {
  const resume = {
    education: [{ degree: "Degree" }],
    summary: "Summary",
    personalInfo: { name: "Name" },
    additional: { technicalSkills: ["Python"] },
    customSections: { volunteer: { sectionType: "text", text: "Actual volunteering" } },
    sectionMeta: [
      { key: "customSections.volunteer", displayName: "Community Service", order: 1 },
      { key: "education", order: 2 },
      { key: "summary", order: 3 },
      { key: "technicalSkills", order: 4 },
    ],
  };
  const items = previewContent.orderedResumeItems(resume);
  assert.deepEqual(
    items.map((item) => item.id),
    [
      "personalInfo",
      "customSections.volunteer",
      "education0",
      "summary",
      "additional.technicalSkills",
    ],
  );
  assert.equal(items[1].label, "Community Service");
  assert.ok(!items.some((item) => item.id === "sectionMeta"));
});

test("underlying resume presentation still retains complete multi-entry content", () => {
  const resume = makeReview().preview.resume_preview;
  resume.workExperience.push({
    title: "Second position",
    company: "Second company",
    description: ["Full responsibility. ".repeat(30)],
  });
  resume.education = [{ degree: "Degree", institution: "School", years: "2010–2014" }];
  resume.unexpectedSection = { detail: "Unknown resume content remains." };
  const before = JSON.stringify(resume);
  const rows = previewContent.orderedResumeItems(resume);
  function presentationText(node) {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) return node.map(presentationText).join("");
    if (typeof node !== "object") return String(node);
    if (typeof node.type === "function") return presentationText(node.type(node.props));
    return presentationText(node.props?.children);
  }
  const output = rows
    .map((item) => presentationText(previewContent.ReviewContent({ item, document: true })))
    .join("");
  assert.ok(output.includes(resume.workExperience[1].description[0]));
  assert.ok(output.includes("Second positionSecond company"));
  assert.ok(output.includes("Unknown resume content remains."));
  assert.equal(JSON.stringify(resume), before);
});

test("Changes keeps every verification note visible even when its related accordion is collapsed", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  run.preview.review.warnings = [
    grounding,
    "Check additional.technicalSkills against your original CV.",
    "2 change(s) rejected during verification",
  ];
  let list = nodes(render()).find((node) => node.type === "FlatList");
  const expected = warnings.reviewWarningsForStep(run.preview.review.warnings, 1);
  assert.deepEqual(
    new Set(list.props.data.filter((item) => item.kind === "warning").map((item) => item.message)),
    new Set(expected),
  );
  const skillNote = list.props.data.find((item) => item.message === expected[1]);
  assert.equal(skillNote.connected, "skill");
  const skillHeader = list.props.data.find((item) => item.section === "skill");
  list.props.renderItem({ item: skillHeader }).props.children.props.onPress();
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.equal(list.props.data.filter((item) => item.message === expected[1]).length, 1);
});
test("Changes omits Engine feedback while retaining complete underlying reports and Continue to Save", () => {
  const preview = makeReview().preview;
  preview.improvements = [
    { suggestion: "A complete engine suggestion. ".repeat(120), lineNumber: 3 },
  ];
  preview.writing = {
    score: 66,
    findings: [
      {
        path: "workExperience[0].description[0]",
        rule: "no_metric",
        excerpt: "Full exact finding",
      },
    ],
    critic_notes: [{ path: "summary", note: "Full critic note" }],
  };
  preview.bullet_selection = {
    bullets_before: 40,
    bullets_after: 40,
    page_fit: "skipped",
    max_pages: null,
  };
  const before = JSON.stringify(preview);
  const feedback = previewContent.reviewItems(preview, "feedback");
  assert.equal(
    feedback.find((i) => i.id.startsWith("improvements")).value,
    preview.improvements[0],
  );
  assert.equal(feedback.find((i) => i.id === "writing").value, preview.writing);
  assert.equal(feedback.find((i) => i.id === "bullet_selection").value, preview.bullet_selection);
  const { run, render } = screenHarness();
  run.step = 1;
  run.preview.preview = preview;
  const screen = render();
  const list = nodes(screen).find((node) => node.type === "FlatList");
  assert.ok(
    !list.props.data.some((item) => item.id === "engine-feedback" || item.kind === "feedback"),
  );
  assert.deepEqual(
    list.props.data.filter((item) => item.kind === "section").map((item) => item.title),
    run.preview.review.change_sections.map(
      (section) =>
        ({
          summary: "Summary Changes",
          skill: "Skills Changes",
          description: "Description Changes",
        })[section.type] ?? primitives.sectionTitle(section.type),
    ),
  );
  assert.ok(list.props.data.some((item) => item.kind === "warning"));
  const continueButton = nodes(screen).find(
    (node) => node.type === "Button" && text(node) === "Continue to Edit CV",
  );
  assert.equal(continueButton.props.disabled, false);
  continueButton.props.onPress();
  assert.equal(run.step, 1);
  assert.match(text(render()), /Continue to Edit CV/);
  assert.equal(JSON.stringify(preview), before);
});
test("read-only resume marks hidden sections without dropping their contents", () => {
  const items = previewContent.orderedResumeItems({
    summary: "Keep this whole text",
    sectionMeta: [{ key: "summary", isVisible: false }],
  });
  assert.equal(items[0].hidden, true);
  assert.equal(items[0].value, "Keep this whole text");
  assert.match(
    text(previewContent.ReviewContent({ item: items[0], document: true })),
    /Hidden in PDF/,
  );
});
