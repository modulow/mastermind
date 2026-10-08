"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CardType = "todo" | "bullets" | "multitext" | "text" | "people" | "date";
type Person = { id: string; name: string; initials: string; color: string };
type Item = { id: string; text: string; done?: boolean };
type MindCard = {
  id: string;
  title: string;
  type: CardType;
  content: string;
  items: Item[];
  comments: Item[];
  people: string[];
  date: string;
  x: number;
  y: number;
  color: string;
  clusterId?: string;
};
type Cluster = { id: string; name: string; color: string; collapsed: boolean };
type Connection = { id: string; from: string; to: string; label: string };
type MapState = { title: string; cards: MindCard[]; clusters: Cluster[]; connections: Connection[] };

const PEOPLE: Person[] = [
  { id: "laurent", name: "Laurent Anciaux", initials: "LA", color: "#3359a8" },
  { id: "sophie", name: "Sophie Lambert", initials: "SL", color: "#ef552f" },
  { id: "marco", name: "Marco Rossi", initials: "MR", color: "#efb52f" },
  { id: "elena", name: "Elena García", initials: "EG", color: "#57c8e8" },
  { id: "jonas", name: "Jonas Müller", initials: "JM", color: "#6e57c8" }
];

const TYPE_LABEL: Record<CardType, string> = {
  todo: "To-do list",
  bullets: "Bullet list",
  multitext: "Multi-line text",
  text: "Single line",
  people: "People",
  date: "Date"
};

const EMPTY_CARD: MindCard = {
  id: "", title: "", type: "text", content: "", items: [], comments: [], people: [], date: "", x: 100, y: 100, color: "blue"
};

const EXAMPLE: MapState = {
  title: "EP · DIGITAL WORKPLACE",
  clusters: [
    { id: "research", name: "RESEARCH", color: "blue", collapsed: false },
    { id: "delivery", name: "DELIVERY", color: "yellow", collapsed: false }
  ],
  cards: [
    { ...EMPTY_CARD, id: "brief", title: "Project brief", type: "multitext", content: "Create one clear digital workspace for the team.", comments: [{ id: "co1", text: "Scope validated with the team" }], x: 80, y: 70, color: "orange", clusterId: "research" },
    { ...EMPTY_CARD, id: "tasks", title: "Next actions", type: "todo", items: [{ id: "i1", text: "Confirm scope", done: true }, { id: "i2", text: "Meet stakeholders" }, { id: "i3", text: "Validate prototype" }], x: 75, y: 330, color: "blue", clusterId: "research" },
    { ...EMPTY_CARD, id: "project", title: "DIGITAL WORKPLACE", type: "text", content: "Master project", x: 450, y: 235, color: "project" },
    { ...EMPTY_CARD, id: "people", title: "Core team", type: "people", people: ["laurent", "sophie", "elena"], comments: [{ id: "co2", text: "Invite the service owner" }, { id: "co3", text: "Add accessibility lead" }], x: 795, y: 65, color: "cyan", clusterId: "delivery" },
    { ...EMPTY_CARD, id: "principles", title: "Principles", type: "bullets", items: [{ id: "p1", text: "Simple" }, { id: "p2", text: "Accessible" }, { id: "p3", text: "Secure" }], x: 810, y: 315, color: "yellow", clusterId: "delivery" },
    { ...EMPTY_CARD, id: "launch", title: "Pilot launch", type: "date", date: "2026-11-16", content: "Pilot with the first team", x: 450, y: 500, color: "violet" }
  ],
  connections: [
    { id: "c1", from: "brief", to: "project", label: "defines" },
    { id: "c2", from: "tasks", to: "project", label: "moves forward" },
    { id: "c3", from: "project", to: "people", label: "owned by" },
    { id: "c4", from: "project", to: "principles", label: "guided by" },
    { id: "c5", from: "project", to: "launch", label: "ready for" }
  ]
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Mastermind() {
  const [map, setMap] = useState<MapState>(EXAMPLE);
  const [dark, setDark] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modal, setModal] = useState<"card" | "link" | "cluster" | null>(null);
  const [draft, setDraft] = useState<MindCard>(EMPTY_CARD);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState({ from: "", to: "", label: "" });
  const [undo, setUndo] = useState<MapState[]>([]);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [wireDrag, setWireDrag] = useState<{ from: string; x: number; y: number } | null>(null);
  const [clusterDrag, setClusterDrag] = useState<{ startX: number; startY: number; cards: { id: string; x: number; y: number }[] } | null>(null);
  const [collapsedBranches, setCollapsedBranches] = useState<string[]>([]);
  const [palette, setPalette] = useState<"classic" | "warm" | "forest">("classic");
  const [viewMode, setViewMode] = useState<"mind" | "org" | "list">("mind");
  const [collaborators, setCollaborators] = useState<Person[]>(PEOPLE.slice(0, 3));
  const clientId = useRef(uid("user"));
  const channelRef = useRef<BroadcastChannel | null>(null);
  const receivingRemoteUpdate = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("mastermind-map");
    if (saved) {
      try { setMap(JSON.parse(saved)); } catch { /* keep example */ }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("mastermind-map", JSON.stringify(map));
    if (!receivingRemoteUpdate.current) channelRef.current?.postMessage({ type: "map", clientId: clientId.current, map });
    receivingRemoteUpdate.current = false;
  }, [map]);

  useEffect(() => {
    const channel = new BroadcastChannel("mastermind-live-project");
    channelRef.current = channel;
    channel.onmessage = event => {
      if (event.data?.clientId === clientId.current) return;
      if (event.data?.type === "map") {
        receivingRemoteUpdate.current = true;
        setMap(event.data.map);
      }
      if (event.data?.type === "presence") setCollaborators(PEOPLE.filter(person => event.data.people.includes(person.id)));
    };
    channel.postMessage({ type: "presence", clientId: clientId.current, people: collaborators.map(person => person.id) });
    return () => channel.close();
  }, []);

  const mutate = useCallback((next: (previous: MapState) => MapState) => {
    setMap(previous => {
      setUndo(history => [...history.slice(-19), previous]);
      return next(previous);
    });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(16, Math.min(920, event.clientX - rect.left - drag.dx));
      const y = Math.max(20, Math.min(570, event.clientY - rect.top - drag.dy));
      setMap(previous => ({ ...previous, cards: previous.cards.map(card => card.id === drag.id ? { ...card, x, y } : card) }));
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag]);

  useEffect(() => {
    if (!wireDrag) return;
    const move = (event: PointerEvent) => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) setWireDrag(value => value ? { ...value, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
    };
    const up = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-card-id]");
      const targetId = target?.dataset.cardId;
      if (targetId && targetId !== wireDrag.from) {
        setLinkDraft({ from: wireDrag.from, to: targetId, label: "" });
        setModal("link");
      }
      setWireDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [wireDrag]);

  useEffect(() => {
    if (!clusterDrag) return;
    const move = (event: PointerEvent) => {
      const dx = event.clientX - clusterDrag.startX;
      const dy = event.clientY - clusterDrag.startY;
      setMap(previous => ({
        ...previous,
        cards: previous.cards.map(card => {
          const origin = clusterDrag.cards.find(value => value.id === card.id);
          return origin ? { ...card, x: Math.max(16, origin.x + dx), y: Math.max(20, origin.y + dy) } : card;
        })
      }));
    };
    const up = () => setClusterDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [clusterDrag]);

  const visibleCards = useMemo(() => {
    const hidden = new Set<string>();
    const hideDescendants = (parentId: string) => {
      map.connections.filter(connection => connection.from === parentId).forEach(connection => {
        if (hidden.has(connection.to)) return;
        hidden.add(connection.to);
        hideDescendants(connection.to);
      });
    };
    collapsedBranches.forEach(hideDescendants);
    return map.cards.filter(card => {
      if (hidden.has(card.id)) return false;
      if (!card.clusterId) return true;
      return !map.clusters.find(cluster => cluster.id === card.clusterId)?.collapsed;
    });
  }, [map, collapsedBranches]);

  const timeline = useMemo(() => map.cards.filter(card => card.type === "date" && card.date).sort((a, b) => a.date.localeCompare(b.date)), [map.cards]);

  const openNewCard = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_CARD, id: uid("card"), x: 430 + Math.random() * 80, y: 210 + Math.random() * 80 });
    setModal("card");
  };

  const openEditCard = (card: MindCard) => {
    setEditingId(card.id);
    setDraft(JSON.parse(JSON.stringify(card)));
    setModal("card");
  };

  const saveCard = () => {
    if (!draft.title.trim()) return;
    mutate(previous => ({
      ...previous,
      cards: editingId ? previous.cards.map(card => card.id === editingId ? draft : card) : [...previous.cards, draft]
    }));
    setModal(null);
  };

  const deleteCard = () => {
    if (!editingId) return;
    mutate(previous => ({
      ...previous,
      cards: previous.cards.filter(card => card.id !== editingId),
      connections: previous.connections.filter(connection => connection.from !== editingId && connection.to !== editingId)
    }));
    setSelected(values => values.filter(id => id !== editingId));
    setModal(null);
  };

  const createConnection = () => {
    if (!linkDraft.from || !linkDraft.to || linkDraft.from === linkDraft.to) return;
    mutate(previous => ({ ...previous, connections: [...previous.connections, { id: uid("link"), ...linkDraft }] }));
    setLinkDraft({ from: "", to: "", label: "" });
    setModal(null);
  };

  const createCluster = (name: string, color: string) => {
    if (selected.length < 2 || !name.trim()) return;
    const id = uid("cluster");
    mutate(previous => ({
      ...previous,
      clusters: [...previous.clusters, { id, name, color, collapsed: false }],
      cards: previous.cards.map(card => selected.includes(card.id) ? { ...card, clusterId: id } : card)
    }));
    setSelected([]);
    setModal(null);
  };

  const toggleCluster = (id: string) => mutate(previous => ({
    ...previous,
    clusters: previous.clusters.map(cluster => cluster.id === id ? { ...cluster, collapsed: !cluster.collapsed } : cluster)
  }));

  const resetMap = () => mutate(() => ({ title: "NEW PROJECT", cards: [{ ...EMPTY_CARD, id: "project", title: "NEW PROJECT", content: "Central project", x: 450, y: 235, color: "project" }], clusters: [], connections: [] }));

  const loadExample = () => mutate(() => JSON.parse(JSON.stringify(EXAMPLE)));

  const undoLast = () => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    setMap(previous);
    setUndo(history => history.slice(0, -1));
  };

  const layoutPosition = (card: MindCard) => {
    if (viewMode === "mind") return { x: card.x, y: card.y };
    const index = visibleCards.findIndex(value => value.id === card.id);
    if (viewMode === "list") return { x: 68, y: 28 + index * 184 };
    if (card.id === "project") return { x: 425, y: 35 };
    const branchIndex = visibleCards.filter(value => value.id !== "project").findIndex(value => value.id === card.id);
    return { x: 70 + (branchIndex % 3) * 340, y: 260 + Math.floor(branchIndex / 3) * 210 };
  };

  const connectionGeometry = (connection: Connection) => {
    const from = visibleCards.find(card => card.id === connection.from);
    const to = visibleCards.find(card => card.id === connection.to);
    if (!from || !to) return null;
    const fromPosition = layoutPosition(from), toPosition = layoutPosition(to);
    const x1 = fromPosition.x + 116, y1 = fromPosition.y + 78, x2 = toPosition.x + 116, y2 = toPosition.y + 78;
    const bend = Math.max(55, Math.abs(x2 - x1) * .34);
    const path = `M ${x1} ${y1} C ${x1 + (x2 > x1 ? bend : -bend)} ${y1}, ${x2 - (x2 > x1 ? bend : -bend)} ${y2}, ${x2} ${y2}`;
    return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 - 8, path };
  };

  return (
    <main className={`app ${dark ? "dark" : ""} palette-${palette} view-${viewMode}`}>
      <header className="masthead">
        <div className="brandLockup">
          <span className="brandRule" />
          <div>
            <span className="eyebrow">THINK WITH CLARITY</span>
            <h1><span>MASTER</span>MIND · MIND MAP</h1>
          </div>
          <p>Turn one project into connected ideas.</p>
        </div>
        <div className="brandBlock"><span /></div>
      </header>

      <nav className="topnav" aria-label="Mastermind actions">
        <div className="navGroup">
          <button onClick={() => setDrawerOpen(value => !value)}><span className="icon">☁</span> Shared</button>
          <button onClick={() => setModal("cluster")} disabled={selected.length < 2}><span className="gridIcon">⊞</span> Group selected</button>
          <button onClick={() => setModal("link")}><span className="linkIcon">↗</span> Link cards</button>
        </div>
        <div className="liveUsers" aria-label={`${collaborators.length} Microsoft 365 collaborators online`}>
          {collaborators.map(person => <span key={person.id} style={{ background: person.color }} title={person.name}>{person.initials}</span>)}
          <strong>Microsoft 365 live</strong>
        </div>
        <button onClick={() => setDark(value => !value)}><span className="icon">◔</span> {dark ? "Light mode" : "Dark mode"}</button>
      </nav>

      <section className="workspace">
        <div className="toolbar">
          <button className="outline" onClick={() => setDrawerOpen(value => !value)}>☰ Cards</button>
          <button className="outline" onClick={resetMap}>New</button>
          <button className="outline" onClick={loadExample}>Example</button>
          <button className="outline muted" disabled={!undo.length} onClick={undoLast}>↶ Undo</button>
          <div className="viewSwitch" aria-label="View mode">
            <button className={viewMode === "mind" ? "active" : ""} onClick={() => setViewMode("mind")}>Mind map</button>
            <button className={viewMode === "org" ? "active" : ""} onClick={() => setViewMode("org")}>Org chart</button>
            <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button>
          </div>
          <div className="paletteSwitch" aria-label="Colour theme">
            <button className="classic" aria-label="Classic colour theme" onClick={() => setPalette("classic")} />
            <button className="warm" aria-label="Warm colour theme" onClick={() => setPalette("warm")} />
            <button className="forest" aria-label="Forest colour theme" onClick={() => setPalette("forest")} />
          </div>
          <label className="projectTitle">
            <span className="srOnly">Project title</span>
            <input value={map.title} onChange={event => setMap(previous => ({ ...previous, title: event.target.value.toUpperCase() }))} />
          </label>
          <button className="primary" onClick={openNewCard}>+ Add card</button>
        </div>
        <p className="guide">Drag cards freely · select two or more cards to group them · create labelled links · dated cards appear automatically in the timeline.</p>

        <div className="mapShell">
          <aside className={drawerOpen ? "drawer open" : "drawer"} aria-hidden={!drawerOpen}>
            <div className="drawerHead"><strong>CARDS</strong><button onClick={() => setDrawerOpen(false)}>×</button></div>
            <button className="drawerAdd" onClick={openNewCard}>+ New card</button>
            {map.cards.map(card => <button key={card.id} className="drawerCard" onClick={() => openEditCard(card)}><span className={`dot ${card.color}`} />{card.title}<small>{TYPE_LABEL[card.type]}</small></button>)}
          </aside>

          <div className="boardViewport">
            <div className="board" ref={boardRef}>
              <div className="boardGrid" />
              <svg className="connections" width="1100" height="700" aria-hidden="true">
                <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" /></marker></defs>
                {wireDrag && (() => {
                  const source = visibleCards.find(card => card.id === wireDrag.from);
                  if (!source) return null;
                  const position = layoutPosition(source);
                  return <path className="wirePreview" d={`M ${position.x + 232} ${position.y + 78} C ${position.x + 300} ${position.y + 78}, ${wireDrag.x - 68} ${wireDrag.y}, ${wireDrag.x} ${wireDrag.y}`} />;
                })()}
                {map.connections.map(connection => {
                  const geometry = connectionGeometry(connection);
                  if (!geometry) return null;
                  return <g key={connection.id} className="connector"><path d={geometry.path} markerEnd="url(#arrow)" /><rect x={geometry.mx - Math.max(28, connection.label.length * 3.5)} y={geometry.my - 11} width={Math.max(56, connection.label.length * 7)} height="22" /><text x={geometry.mx} y={geometry.my + 4}>{connection.label}</text></g>;
                })}
              </svg>

              {map.clusters.map(cluster => {
                const cards = map.cards.filter(card => card.clusterId === cluster.id);
                if (!cards.length) return null;
                const minX = Math.min(...cards.map(card => card.x)) - 20;
                const minY = Math.min(...cards.map(card => card.y)) - 42;
                const maxX = Math.max(...cards.map(card => card.x)) + 252;
                const maxY = Math.max(...cards.map(card => card.y)) + 190;
                return cluster.collapsed ? (
                  <button key={cluster.id} className={`clusterCollapsed ${cluster.color}`} style={{ left: minX, top: minY }} onClick={() => toggleCluster(cluster.id)}>
                    <span>›</span><strong>{cluster.name}</strong><small>{cards.length} cards</small>
                  </button>
                ) : (
                  <div key={cluster.id} className={`cluster ${cluster.color}`} style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}>
                    <button onClick={() => toggleCluster(cluster.id)}><span>⌄</span> {cluster.name}<small>{cards.length} cards</small></button>
                    <button className="clusterMove" aria-label={`Move cluster ${cluster.name}`} title="Move the whole cluster" onPointerDown={event => {
                      event.stopPropagation();
                      setClusterDrag({ startX: event.clientX, startY: event.clientY, cards: cards.map(card => ({ id: card.id, x: card.x, y: card.y })) });
                    }}>✥</button>
                  </div>
                );
              })}

              {visibleCards.map(card => (
                <article key={card.id} data-card-id={card.id} className={`mindCard ${card.color} ${selected.includes(card.id) ? "selected" : ""}`} style={{ transform: `translate(${layoutPosition(card).x}px, ${layoutPosition(card).y}px)` }}>
                  <button className="selectCard" aria-label={`Select ${card.title}`} onClick={() => setSelected(values => values.includes(card.id) ? values.filter(id => id !== card.id) : [...values, card.id])}>{selected.includes(card.id) ? "✓" : ""}</button>
                  <div className="cardDrag" onPointerDown={event => {
                    const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    setDrag({ id: card.id, dx: event.clientX - rect.left, dy: event.clientY - rect.top });
                  }}>
                    <span>{TYPE_LABEL[card.type]}</span>
                    <div className="cardActions">
                      {map.connections.some(connection => connection.from === card.id) && <button className="branchToggle" aria-label={`${collapsedBranches.includes(card.id) ? "Expand" : "Collapse"} branch ${card.title}`} onPointerDown={event => event.stopPropagation()} onClick={() => setCollapsedBranches(values => values.includes(card.id) ? values.filter(id => id !== card.id) : [...values, card.id])}>{collapsedBranches.includes(card.id) ? "+" : "−"}</button>}
                      <button aria-label={`Edit ${card.title}`} onPointerDown={event => event.stopPropagation()} onClick={() => openEditCard(card)}>•••</button>
                    </div>
                  </div>
                  <button className="cardBody" onClick={() => openEditCard(card)}>
                    <h3>{card.title}</h3>
                    <CardContent card={card} />
                    {(card.comments || []).length > 0 && <span className="commentCount">{card.comments.length} comment{card.comments.length > 1 ? "s" : ""}</span>}
                  </button>
                  <button className="wirePort" aria-label={`Draw connection from ${card.title}`} title="Drag to another card" onPointerDown={event => {
                    event.stopPropagation();
                    const rect = boardRef.current?.getBoundingClientRect();
                    if (rect) setWireDrag({ from: card.id, x: event.clientX - rect.left, y: event.clientY - rect.top });
                  }}><span /></button>
                  <span className="fold" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="timelineSection">
        <div className="sectionLabel"><span /> TIMELINE</div>
        <div className="timelineLine" />
        <div className="timelineItems">
          {timeline.length ? timeline.map((card, index) => (
            <button key={card.id} className="timelineItem" onClick={() => openEditCard(card)}>
              <span className="timelineIndex">{String(index + 1).padStart(2, "0")}</span>
              <time>{new Date(`${card.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>
              <strong>{card.title}</strong>
              <small>{card.content}</small>
            </button>
          )) : <p className="emptyTimeline">Add a dated card to build the timeline.</p>}
        </div>
      </section>

      <footer><span className="footerMark">M</span><strong>MASTER<span>MIND</span></strong><p>One project. Every idea connected.</p></footer>

      {modal === "card" && <CardModal draft={draft} setDraft={setDraft} editing={Boolean(editingId)} onClose={() => setModal(null)} onSave={saveCard} onDelete={deleteCard} clusters={map.clusters} />}
      {modal === "link" && <LinkModal cards={map.cards} value={linkDraft} setValue={setLinkDraft} onClose={() => setModal(null)} onSave={createConnection} />}
      {modal === "cluster" && <ClusterModal count={selected.length} onClose={() => setModal(null)} onSave={createCluster} />}
    </main>
  );
}

function CardContent({ card }: { card: MindCard }) {
  if (card.type === "todo") return <ul className="miniList">{card.items.slice(0, 4).map(item => <li key={item.id} className={item.done ? "done" : ""}><span>{item.done ? "✓" : ""}</span>{item.text}</li>)}</ul>;
  if (card.type === "bullets") return <ul className="bullets">{card.items.slice(0, 4).map(item => <li key={item.id}>{item.text}</li>)}</ul>;
  if (card.type === "people") return <div className="peopleStack">{card.people.map(id => { const person = PEOPLE.find(value => value.id === id); return person ? <span key={id} style={{ background: person.color }} title={person.name}>{person.initials}</span> : null; })}</div>;
  if (card.type === "date") return <><time className="cardDate">{card.date ? new Date(`${card.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "No date"}</time><p>{card.content}</p></>;
  return <p>{card.content || "Add content"}</p>;
}

function CardModal({ draft, setDraft, editing, onClose, onSave, onDelete, clusters }: { draft: MindCard; setDraft: (value: MindCard) => void; editing: boolean; onClose: () => void; onSave: () => void; onDelete: () => void; clusters: Cluster[] }) {
  const itemText = draft.items.map(item => `${item.done ? "[x] " : ""}${item.text}`).join("\n");
  const commentText = (draft.comments || []).map(item => item.text).join("\n");
  return <div className="modalBackdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modalCard" role="dialog" aria-modal="true" aria-labelledby="card-modal-title">
      <div className="modalTop"><div><span>CARD</span><h2 id="card-modal-title">{editing ? "Edit card" : "New card"}</h2></div><button onClick={onClose}>×</button></div>
      <div className="formGrid">
        <label className="wide">Title<input autoFocus value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Type<select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as CardType })}>{Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Colour<select value={draft.color} onChange={event => setDraft({ ...draft, color: event.target.value })}><option value="blue">Blue</option><option value="orange">Orange</option><option value="yellow">Yellow</option><option value="cyan">Cyan</option><option value="violet">Violet</option></select></label>
        <label>Cluster<select value={draft.clusterId || ""} onChange={event => setDraft({ ...draft, clusterId: event.target.value || undefined })}><option value="">None</option>{clusters.map(cluster => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}</select></label>
        {draft.type === "date" && <label>Date<input type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>}
        {(draft.type === "todo" || draft.type === "bullets") && <label className="wide">One item per line<textarea rows={6} value={itemText} onChange={event => setDraft({ ...draft, items: event.target.value.split("\n").filter(Boolean).map((text, index) => ({ id: draft.items[index]?.id || uid("item"), text: text.replace(/^\[x\]\s*/i, ""), done: /^\[x\]\s*/i.test(text) })) })} /></label>}
        {(draft.type === "multitext" || draft.type === "text" || draft.type === "date") && <label className="wide">Text{draft.type === "multitext" ? <textarea rows={6} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} /> : <input value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} />}</label>}
        {draft.type === "people" && <fieldset className="wide peoplePicker"><legend>Microsoft 365 people</legend>{PEOPLE.map(person => <label key={person.id}><input type="checkbox" checked={draft.people.includes(person.id)} onChange={() => setDraft({ ...draft, people: draft.people.includes(person.id) ? draft.people.filter(id => id !== person.id) : [...draft.people, person.id] })} /><span style={{ background: person.color }}>{person.initials}</span>{person.name}</label>)}</fieldset>}
        <label className="wide commentsField">Comments<textarea rows={4} value={commentText} placeholder="One comment per line" onChange={event => setDraft({ ...draft, comments: event.target.value.split("\n").filter(Boolean).map((text, index) => ({ id: draft.comments?.[index]?.id || uid("comment"), text })) })} /></label>
      </div>
      <div className="modalActions">{editing && <button className="danger" onClick={onDelete}>Delete</button>}<span /><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={onSave}>Save card</button></div>
    </section>
  </div>;
}

function LinkModal({ cards, value, setValue, onClose, onSave }: { cards: MindCard[]; value: { from: string; to: string; label: string }; setValue: (value: { from: string; to: string; label: string }) => void; onClose: () => void; onSave: () => void }) {
  return <div className="modalBackdrop"><section className="modalCard compact" role="dialog" aria-modal="true" aria-labelledby="link-modal-title"><div className="modalTop"><div><span>CONNECTION</span><h2 id="link-modal-title">Link two cards</h2></div><button onClick={onClose}>×</button></div><div className="formGrid"><label>From<select value={value.from} onChange={event => setValue({ ...value, from: event.target.value })}><option value="">Choose</option>{cards.map(card => <option key={card.id} value={card.id}>{card.title}</option>)}</select></label><label>To<select value={value.to} onChange={event => setValue({ ...value, to: event.target.value })}><option value="">Choose</option>{cards.map(card => <option key={card.id} value={card.id}>{card.title}</option>)}</select></label><label className="wide">Sentence on the connection<input autoFocus value={value.label} onChange={event => setValue({ ...value, label: event.target.value })} placeholder="leads to" /></label></div><div className="modalActions"><span /><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={onSave}>Create link</button></div></section></div>;
}

function ClusterModal({ count, onClose, onSave }: { count: number; onClose: () => void; onSave: (name: string, color: string) => void }) {
  const [name, setName] = useState("NEW CLUSTER");
  const [color, setColor] = useState("blue");
  return <div className="modalBackdrop"><section className="modalCard compact" role="dialog" aria-modal="true" aria-labelledby="cluster-modal-title"><div className="modalTop"><div><span>GROUP</span><h2 id="cluster-modal-title">Create a cluster</h2><p>{count} selected cards</p></div><button onClick={onClose}>×</button></div><div className="formGrid"><label className="wide">Cluster name<input autoFocus value={name} onChange={event => setName(event.target.value.toUpperCase())} /></label><label>Colour<select value={color} onChange={event => setColor(event.target.value)}><option value="blue">Blue</option><option value="orange">Orange</option><option value="yellow">Yellow</option><option value="cyan">Cyan</option><option value="violet">Violet</option></select></label></div><div className="modalActions"><span /><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(name, color)}>Group cards</button></div></section></div>;
}
