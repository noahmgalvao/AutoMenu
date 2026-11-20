import { MINI_FOODS, miniFoodIconUrl, type MiniFoodKind } from '../../../domain/menu/miniFoods';

export function MiniFoodChoices({ selected, choose }: {
  selected?: MiniFoodKind;
  choose: (kind: MiniFoodKind) => void;
}) {
  return <div role="group" aria-label="Mini comidas" className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1">
    {MINI_FOODS.map(({ name, kind }) => (
      <button key={kind} type="button" aria-pressed={selected === kind} onClick={() => choose(kind)}
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-slate-700 hover:bg-slate-50 aria-pressed:bg-indigo-50 aria-pressed:font-semibold aria-pressed:text-indigo-700">
        <img src={miniFoodIconUrl(kind)} alt="" width={23} height={23} loading="lazy" className="shrink-0" />
        {name}
      </button>
    ))}
  </div>;
}
