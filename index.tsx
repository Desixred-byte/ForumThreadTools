/*
 * ForumThreadTools, a Vencord plugin
 * Copyright (c) 2026 Bakhishov
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { ChannelStore, React, UserStore } from "@webpack/common";

type SortMode = "native" | "newest" | "oldest" | "active";
type StatusMode = "all" | "open" | "locked";

interface ThreadFilters {
    sort: SortMode;
    status: StatusMode;
    author: string;
    query: string;
    tags: string[];
    tagMode: "or" | "and";
}

const DEFAULT_FILTERS: ThreadFilters = { sort: "native", status: "all", author: "", query: "", tags: [], tagMode: "or" };

let state: ThreadFilters = DEFAULT_FILTERS;
const listeners = new Set<() => void>();

const counts = { raw: [0, 0, 0], shown: [0, 0, 0] };
let loadMore: (() => void) | null = null;

function setLoader(fn: any) {
    loadMore = typeof fn === "function" ? fn : null;
    return fn;
}

function setFilters(changes: Partial<ThreadFilters>) {
    state = { ...state, ...changes };
    listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function useFilters(): ThreadFilters {
    return (React as any).useSyncExternalStore(subscribe, () => state);
}

function snowflakeTime(id?: string | null): number {
    if (!id) return 0;
    try {
        return Number((BigInt(id) >> 22n) + 1420070400000n);
    } catch {
        return 0;
    }
}

function matchesAuthor(thread: any, search: string): boolean {
    const term = search.trim().toLowerCase();
    if (!term) return true;

    const id = String(thread.ownerId ?? "");
    const user: any = id ? UserStore.getUser(id) : null;

    return (
        id.toLowerCase().includes(term) ||
        String(user?.username ?? "").toLowerCase().includes(term) ||
        String(user?.globalName ?? "").toLowerCase().includes(term)
    );
}

function matchesThread(threadId: string, f: ThreadFilters): boolean {
    const thread: any = ChannelStore.getChannel(threadId);
    if (!thread) return true;

    if (!matchesAuthor(thread, f.author)) return false;

    const locked = thread.threadMetadata?.locked === true;
    if (f.status === "locked" && !locked) return false;
    if (f.status === "open" && locked) return false;

    const q = f.query.trim().toLowerCase();
    if (q && !String(thread.name ?? "").toLowerCase().includes(q)) return false;

    if (f.tags.length) {
        const applied: string[] = thread.appliedTags ?? [];
        const ok = f.tagMode === "and"
            ? f.tags.every(t => applied.includes(t))
            : f.tags.some(t => applied.includes(t));
        if (!ok) return false;
    }

    return true;
}

function isPinned(id: string): boolean {
    const c: any = ChannelStore.getChannel(id);
    return ((c?.flags ?? 0) & 2) !== 0;
}

function isDefaultFilters(f: ThreadFilters) {
    return f.sort === "native" && f.status === "all" && !f.author.trim() && !f.query.trim() && !f.tags.length;
}

function processList(list: string[], f: ThreadFilters): string[] {
    if (isDefaultFilters(f)) return list;

    let out = list.filter(id => typeof id !== "string" || matchesThread(id, f));

    if (f.sort !== "native") {
        out = [...out].sort((a, b) => {
            const pa = isPinned(a), pb = isPinned(b);
            if (pa !== pb) return pa ? -1 : 1;
            if (f.sort === "newest") return snowflakeTime(b) - snowflakeTime(a);
            if (f.sort === "oldest") return snowflakeTime(a) - snowflakeTime(b);
            const ca: any = ChannelStore.getChannel(a);
            const cb: any = ChannelStore.getChannel(b);
            return snowflakeTime(cb?.lastMessageId ?? b) - snowflakeTime(ca?.lastMessageId ?? a);
        });
    }

    return out;
}

function useFiltered(list: any, slot: number) {
    const f = useFilters();
    const out: any = React.useMemo(() => Array.isArray(list) ? processList(list, f) : list, [list, f]);
    if (Array.isArray(list)) {
        counts.raw[slot] = list.length;
        counts.shown[slot] = out.length;
    }
    return out;
}

const CSS = `
.ftt-root{background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:16px;margin:8px 0 14px;color:#f2f3f5;overflow:hidden;animation:ftt-in .3s cubic-bezier(.2,.8,.2,1) both;box-shadow:0 2px 10px rgba(0,0,0,.25)}
@keyframes ftt-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@keyframes ftt-spin{to{transform:rotate(360deg)}}
.ftt-spin{animation:ftt-spin .9s linear infinite}
.ftt-head{display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;user-select:none;transition:background .15s}
.ftt-head:hover{background:rgba(255,255,255,0.04)}
.ftt-title{font-weight:700;font-size:15px}
.ftt-badge{background:#5865f2;color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:700;animation:ftt-pop .2s ease both}
@keyframes ftt-pop{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
.ftt-summary{margin-left:auto;color:#b5bac1;font-size:13px}
.ftt-chev{transition:transform .25s ease;color:#b5bac1}
.ftt-chev.closed{transform:rotate(-90deg)}
.ftt-collapse{display:grid;grid-template-rows:1fr;transition:grid-template-rows .28s ease}
.ftt-collapse.closed{grid-template-rows:0fr}
.ftt-collapse>div{overflow:hidden;min-height:0}
.ftt-body{padding:4px 16px 16px;display:flex;flex-direction:column;gap:12px}
.ftt-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ftt-label{display:flex;align-items:center;gap:6px;color:#b5bac1;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;min-width:64px}
.ftt-input{flex:1 1 200px;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:0 10px;height:38px;color:#b5bac1;transition:border-color .15s,box-shadow .15s,background .15s}
.ftt-input:focus-within{border-color:#5865f2;box-shadow:0 0 0 3px rgba(88,101,242,.28);color:#fff;background:rgba(0,0,0,0.5)}
.ftt-input input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:#f2f3f5;font-size:14px;height:100%}
.ftt-input input::placeholder{color:#80848e}
.ftt-x{display:flex;background:transparent;border:none;color:#b5bac1;cursor:pointer;border-radius:50%;padding:3px;transition:background .15s,color .15s}
.ftt-x:hover{background:rgba(255,255,255,.12);color:#fff}
.ftt-btn{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.07);color:#f2f3f5;border:1px solid rgba(255,255,255,0.06);border-radius:999px;padding:5px 13px;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .18s,color .18s,transform .1s,box-shadow .18s,border-color .18s}
.ftt-btn:hover{background:rgba(255,255,255,0.14)}
.ftt-btn:active{transform:scale(.95)}
.ftt-btn.on{background:#5865f2;border-color:#5865f2;color:#fff;box-shadow:0 2px 8px rgba(88,101,242,.4)}
.ftt-btn.on:hover{background:#4752c4}
.ftt-btn.primary{background:#5865f2;border-color:#5865f2;color:#fff}
.ftt-btn.primary:hover{background:#4752c4}
.ftt-btn.danger:hover{background:rgba(218,55,60,.85)}
.ftt-tagimg{width:16px;height:16px;border-radius:3px;object-fit:contain}
@media (prefers-reduced-motion:reduce){.ftt-root,.ftt-badge,.ftt-collapse,.ftt-chev,.ftt-btn{animation:none!important;transition:none!important}}
`;

function Icon({ children, size = 16 }: { children: React.ReactNode; size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            {children}
        </svg>
    );
}

const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>;
const UserIcon = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></Icon>;
const TagIcon = () => <Icon><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" /></Icon>;
const SortIcon = () => <Icon><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></Icon>;
const LockIcon = () => <Icon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></Icon>;
const UnlockIcon = () => <Icon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 017.5-2" /></Icon>;
const XIcon = () => <Icon size={14}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
const ChevIcon = () => <Icon size={18}><path d="M6 9l6 6 6-6" /></Icon>;
const FilterIcon = () => <Icon size={18}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></Icon>;
const DownloadIcon = () => <Icon><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Icon>;
const LoaderIcon = () => <span className="ftt-spin" style={{ display: "inline-flex" }}><Icon><path d="M21 12a9 9 0 11-6.2-8.6" /></Icon></span>;

function Btn({ active, onClick, className = "", children }: { active?: boolean; onClick: () => void; className?: string; children: React.ReactNode; }) {
    return (
        <button type="button" className={"ftt-btn " + (active ? "on " : "") + className} onClick={onClick}>
            {children}
        </button>
    );
}

function TextField({ icon, value, placeholder, label, onChange }: { icon: React.ReactNode; value: string; placeholder: string; label: string; onChange: (v: string) => void; }) {
    return (
        <label className="ftt-input">
            {icon}
            <input aria-label={label} placeholder={placeholder} value={value} onChange={e => onChange(e.currentTarget.value)} />
            {value && (
                <button type="button" className="ftt-x" aria-label="Clear" onClick={() => onChange("")}>
                    <XIcon />
                </button>
            )}
        </label>
    );
}

function Toolbar({ channelId }: { channelId: string; }) {
    const f = useFilters();
    const [open, setOpen] = React.useState(true);
    const [loading, setLoading] = React.useState(false);
    const [, force] = React.useState(0);

    const channel: any = ChannelStore.getChannel(channelId);
    const availableTags: any[] = channel?.availableTags ?? [];

    React.useEffect(() => {
        const t = setInterval(() => force(n => n + 1), 600);
        return () => clearInterval(t);
    }, []);

    React.useEffect(() => {
        if (!loading) return;
        let last = counts.raw[0] + counts.raw[1];
        let stale = 0;
        const t = setInterval(() => {
            const now = counts.raw[0] + counts.raw[1];
            stale = now === last ? stale + 1 : 0;
            last = now;
            if (stale >= 4 || !loadMore) {
                setLoading(false);
                return;
            }
            try { loadMore(); } catch { setLoading(false); }
        }, 700);
        return () => clearInterval(t);
    }, [loading]);

    const raw = counts.raw[0] + counts.raw[1];
    const shown = counts.shown[0] + counts.shown[1];

    const activeCount =
        (f.query.trim() ? 1 : 0) + (f.author.trim() ? 1 : 0) + f.tags.length +
        (f.sort !== "native" ? 1 : 0) + (f.status !== "all" ? 1 : 0);

    const toggleTag = (id: string) => setFilters({
        tags: f.tags.includes(id) ? f.tags.filter(t => t !== id) : [...f.tags, id]
    });

    const sorts: [SortMode, string][] = [["native", "Default"], ["newest", "Newest"], ["oldest", "Oldest"], ["active", "Recently active"]];

    return (
        <div className="ftt-root">
            <style>{CSS}</style>

            <div className="ftt-head" onClick={() => setOpen(o => !o)}>
                <FilterIcon />
                <span className="ftt-title">Thread tools</span>
                {activeCount > 0 && <span className="ftt-badge" key={activeCount}>{activeCount}</span>}
                <span className="ftt-summary">
                    {loading ? "Loading more posts… " : ""}{shown} of {raw} loaded
                </span>
                <span className={"ftt-chev" + (open ? "" : " closed")}><ChevIcon /></span>
            </div>

            <div className={"ftt-collapse" + (open ? "" : " closed")}>
                <div>
                    <div className="ftt-body">
                        <div className="ftt-row">
                            <TextField icon={<SearchIcon />} label="Search thread titles" placeholder="Search titles" value={f.query} onChange={v => setFilters({ query: v })} />
                            <TextField icon={<UserIcon />} label="Filter by author" placeholder="Author name or user ID" value={f.author} onChange={v => setFilters({ author: v })} />
                        </div>

                        <div className="ftt-row">
                            <span className="ftt-label"><SortIcon /> Sort</span>
                            {sorts.map(([mode, text]) => (
                                <Btn key={mode} active={f.sort === mode} onClick={() => setFilters({ sort: mode })}>{text}</Btn>
                            ))}
                        </div>

                        <div className="ftt-row">
                            <span className="ftt-label"><LockIcon /> Status</span>
                            <Btn active={f.status === "all"} onClick={() => setFilters({ status: "all" })}>All</Btn>
                            <Btn active={f.status === "open"} onClick={() => setFilters({ status: "open" })}><UnlockIcon /> Unlocked</Btn>
                            <Btn active={f.status === "locked"} onClick={() => setFilters({ status: "locked" })}><LockIcon /> Locked</Btn>
                        </div>

                        {availableTags.length > 0 && (
                            <div className="ftt-row">
                                <span className="ftt-label"><TagIcon /> Tags</span>
                                {availableTags.map(tag => (
                                    <Btn key={tag.id} active={f.tags.includes(tag.id)} onClick={() => toggleTag(tag.id)}>
                                        {tag.emojiId
                                            ? <img className="ftt-tagimg" src={`https://cdn.discordapp.com/emojis/${tag.emojiId}.webp?size=32`} alt="" />
                                            : tag.emojiName ? <span>{tag.emojiName}</span> : null}
                                        {tag.name}
                                    </Btn>
                                ))}
                                <span className="ftt-label" style={{ minWidth: 0, marginLeft: 8 }}>Match</span>
                                <Btn active={f.tagMode === "or"} onClick={() => setFilters({ tagMode: "or" })}>Any</Btn>
                                <Btn active={f.tagMode === "and"} onClick={() => setFilters({ tagMode: "and" })}>All</Btn>
                            </div>
                        )}

                        <div className="ftt-row">
                            <Btn className="primary" onClick={() => setLoading(l => !l)}>
                                {loading ? <><LoaderIcon /> Stop loading</> : <><DownloadIcon /> Load all posts</>}
                            </Btn>
                            <Btn className="danger" onClick={() => setFilters(DEFAULT_FILTERS)}><XIcon /> Clear all</Btn>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default definePlugin({
    name: "ForumThreadTools",
    description: "Local sorting, author filtering, tag filtering, status filtering and title search for forum channels.",
    authors: [{ name: "Bakhishov", id: 386421496463097857n }],

    patches: [
        {
            find: "threadIdsBySection",
            replacement: [
                {
                    match: /(\i)=(\i)\.useMemo\((\(\)=>\{if\(\i\)if\(!\i&&\i\)return\[1,0\];[\s\S]+?\},\[\i,\i,(\i)\.length,(\i)\.length,\i,\i,\i,(\i),\i,\i,\i,\i,\i\])\),(\i)=\2\.useMemo\((\(\)=>!\i&&\i\?\[\[\],\[\]\]:[\s\S]+?\])\),/,
                    replace: "vcFJ=$self.useFiltered($4,0),vcFB=$self.useFiltered($5,1),vcFE=$self.useFiltered($6,2),$1=(($4,$5,$6)=>$2.useMemo($3))(vcFJ,vcFB,vcFE),$7=(($4,$5,$6)=>$2.useMemo($8))(vcFJ,vcFB,vcFE),"
                },
                {
                    match: /children:(!\i)&&\(0,(\i)\.jsx\)\((\i),\{channel:(\i),hasAnyThread:(\i),hasActiveThreads:(\i)\},\4\.id\)/,
                    replace: "children:$1&&(0,$2.jsxs)($2.Fragment,{children:[(0,$2.jsx)($self.Toolbar,{channelId:$4.id}),(0,$2.jsx)($3,{channel:$4,hasAnyThread:$5,hasActiveThreads:$6},$4.id)]})"
                }
            ]
        },
        {
            // optional: grab Discord's own "load more posts" function so "Load all posts" can use it
            find: "threadIdsBySection",
            replacement: {
                match: /(&&(\i)\(\)\},\[\i,\i,\i\.guild_id,\i\.id,\i,\2\]\)),/,
                replace: "$1,vcLoadMore=$self.setLoader($2),"
            }
        }
    ],

    useFiltered,
    setLoader,
    Toolbar
});

