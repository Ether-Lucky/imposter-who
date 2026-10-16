/**
 * Check-in on the board (04 §4.1 to §4.3): QR at left, passengers at right, the GATE sign
 * bottom right. Panels (timetable, how to play, phone help) slide over the passenger rows.
 */
import { useEffect, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from '@phosphor-icons/react';
import type { HostView } from '@imposter-who/core';
import { BoardItem, useBoard } from '../flap/BoardGrid.tsx';
import { FlapRow } from '../flap/Flap.tsx';
import { useReducedMotion } from '../ui/motion.ts';
import { getCategories, getJoinInfo, type CategoryList, type JoinInfo } from './api.ts';
import { CategoryEditor } from './CategoryEditor.tsx';
import { Help } from './Help.tsx';
import { FIRST_ROW, FOOTER_ROW, Headline, MAX_ROWS, PassengerRows } from './rows.tsx';
import { HowToPlay } from './HowToPlay.tsx';
import { ATTRACT, boardRows, headline, type BoardRow } from './model.ts';
import { Timetable } from './Settings.tsx';
import { SignRun, SignRunLeft, type SignSpec } from './Sign.tsx';
import type { Send } from './types.ts';

type Panel = 'timetable' | 'rules' | 'help' | null;

/** Passenger columns start right of the QR block. */
const LIST_LEFT = 12;

export function QrBlock({ info }: { info: JoinInfo | null }) {
  return (
    <>
      <BoardItem col={0} row={FIRST_ROW} w={11} h={8}>
        {info?.qrSvg ? (
          <div
            className="grid size-full place-items-center rounded-[3px] bg-ink p-[calc(var(--cell-h)*0.2)] [&_svg]:size-full"
            aria-label="QR code to check in"
            role="img"
            // Server-generated SVG from the qrcode package; contains no user input.
            dangerouslySetInnerHTML={{ __html: info.qrSvg }}
          />
        ) : (
          <div className="grid size-full place-items-center rounded-[3px] bg-flap p-3 text-center board-text">
            {info ? 'No Wi-Fi address found. Open HELP.' : 'Finding the address…'}
          </div>
        )}
      </BoardItem>
      {info?.url && (
        <BoardItem col={0} row={FIRST_ROW + 8} w={11} h={2}>
          <p className="board-text font-mono break-all text-ink">{info.url}</p>
        </BoardItem>
      )}
    </>
  );
}

/** Attract loop (04 §4.1): an empty row flaps a fake destination now and then. */
function Attract({ taken }: { taken: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<{ row: number; text: string } | null>(null);
  const idle = taken === 0 && !reduced;
  useEffect(() => {
    if (!idle) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(
        () => {
          if (document.hidden) return next();
          const row = Math.floor(Math.random() * MAX_ROWS);
          const text = ATTRACT[Math.floor(Math.random() * ATTRACT.length)]!;
          setShown({ row, text });
          timer = setTimeout(() => {
            setShown((s) => s && { ...s, text: '' });
            next();
          }, 2600);
        },
        6000 + Math.random() * 4000,
      );
    };
    next();
    return () => clearTimeout(timer);
  }, [idle]);
  if (!idle || !shown) return null;
  return (
    <BoardItem col={LIST_LEFT + 3} row={FIRST_ROW + shown.row} w={12}>
      <FlapRow text={shown.text} width={12} tone="dim" />
    </BoardItem>
  );
}

/** The selected passenger's controls, set into their status cells. */
function RowControls({
  row,
  index,
  ids,
  send,
}: {
  row: BoardRow;
  index: number;
  ids: string[];
  send: Send;
}) {
  const move = (by: number) => {
    const order = [...ids];
    const [id] = order.splice(index, 1);
    order.splice(index + by, 0, id!);
    void send('seat:reorder', { order });
  };
  const btn =
    'grid h-full place-items-center rounded-[3px] border-[1.5px] border-ink/35 text-ink disabled:opacity-30 active:scale-[0.97]';
  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateColumns: 'repeat(12, calc(var(--cell-h) * 0.68))',
        columnGap: 'calc(var(--cell-h) * 0.08)',
      }}
    >
      <button
        type="button"
        className={`${btn} col-span-3`}
        disabled={index === 0}
        aria-label={`Move ${row.name} up`}
        onClick={() => move(-1)}
      >
        <ArrowUpIcon size="60%" weight="bold" />
      </button>
      <button
        type="button"
        className={`${btn} col-span-3`}
        disabled={index === ids.length - 1}
        aria-label={`Move ${row.name} down`}
        onClick={() => move(1)}
      >
        <ArrowDownIcon size="60%" weight="bold" />
      </button>
      <button
        type="button"
        className={`${btn} col-span-6 border-red text-red`}
        aria-label={`Remove ${row.name}`}
        onClick={() => {
          if (confirm(`Remove ${row.name} from the board?`))
            void send('player:remove', { id: row.id });
        }}
      >
        <XIcon size="55%" weight="bold" />
      </button>
    </div>
  );
}

export function Lobby({ view, send }: { view: HostView; send: Send }) {
  const grid = useBoard();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [categories, setCategories] = useState<CategoryList | null>(null);
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadJoin = (address?: string) =>
    getJoinInfo(address).then(setInfo, (e: Error) => setError(e.message));

  useEffect(() => {
    void loadJoin();
    getCategories().then(setCategories, (e: Error) => setError(e.message));
  }, []);

  const ids = view.players.map((p) => p.id);
  const rows = boardRows(view).map((r) => {
    const p = view.players.find((x) => x.id === r.id)!;
    return view.round && p.connected ? { ...r, status: `${p.score} PTS` } : r;
  });
  const connected = view.players.filter((p) => p.connected).length;
  const start = async () => {
    const ack = await send('round:start');
    setError(ack.ok ? null : ack.message);
  };

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const left: SignSpec[] = [
    {
      label: 'TIMETABLE',
      onClick: () => toggle('timetable'),
      title: 'Timetable (settings)',
      tone: panel === 'timetable' ? 'outline-amber' : 'plain',
    },
    {
      label: 'RULES',
      onClick: () => toggle('rules'),
      title: 'How to play',
      tone: panel === 'rules' ? 'outline-amber' : 'plain',
    },
    {
      label: 'HELP',
      onClick: () => toggle('help'),
      title: "Phones can't connect?",
      tone: panel === 'help' ? 'outline-amber' : 'plain',
    },
  ];
  const gate: SignSpec = {
    label: connected < 3 ? `NEED ${3 - connected} MORE` : 'START',
    tone: 'amber',
    disabled: connected < 3,
    onClick: () => void start(),
    title: connected < 3 ? `Need ${3 - connected} more passengers` : 'Start round',
  };
  const modeText = view.settings.mode === 'manhunt' ? 'MANHUNT' : 'CLASSIC';

  return (
    <>
      <BoardItem col={0} row={0} w={13}>
        <FlapRow text="IMPOSTER WHO?" width={13} />
      </BoardItem>
      <BoardItem col={-1} row={0} w={7}>
        <FlapRow text={modeText} width={7} tone="dim" />
      </BoardItem>
      <Headline
        text={error ? error.toUpperCase() : headline(view)}
        tone={error ? 'red' : 'amber'}
      />
      <QrBlock info={info} />
      <PassengerRows
        view={view}
        rows={rows}
        left={LIST_LEFT}
        clue={false}
        selected={selected}
        onRowClick={(row) => setSelected((s) => (s === row.id ? null : row.id))}
        renderStatus={(row, r) =>
          row.id === selected ? (
            <RowControls row={row} index={r - FIRST_ROW} ids={ids} send={send} />
          ) : undefined
        }
      />
      <Attract taken={view.players.length} />
      <SignRunLeft row={FOOTER_ROW} signs={left} />
      <SignRun row={FOOTER_ROW} signs={[gate]} />

      <BoardItem
        col={0}
        row={FIRST_ROW}
        w={grid.cols}
        h={MAX_ROWS}
        className="pointer-events-none overflow-hidden"
      >
        <Timetable
          open={panel === 'timetable'}
          settings={view.settings}
          categories={categories}
          send={send}
          onEditCustom={() => setEditing(true)}
        />
      </BoardItem>
      {panel === 'rules' && <HowToPlay mode={view.settings.mode} onClose={() => setPanel(null)} />}
      {panel === 'help' && (
        <Help info={info} onAddress={(a) => void loadJoin(a)} onClose={() => setPanel(null)} />
      )}
      {editing && categories && (
        <CategoryEditor
          categories={categories}
          onSaved={setCategories}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
