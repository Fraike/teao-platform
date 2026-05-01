import { useQuotationStore } from "../lib/store";
import { Plus, Trash2, GripVertical } from "lucide-react";

export default function TermsEditor() {
  const terms = useQuotationStore((s) => s.quotation.terms);
  const setTerms = useQuotationStore((s) => s.setTerms);

  const add = () => setTerms([...terms, `条款 ${terms.length + 1}`]);
  const remove = (idx: number) => setTerms(terms.filter((_, i) => i !== idx));
  const update = (idx: number, value: string) => {
    setTerms(terms.map((t, i) => (i === idx ? value : t)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-1 h-4 bg-rose-500 rounded-full" />
          条款与备注
        </h3>
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-rose-50 text-rose-600 rounded hover:bg-rose-100"
        >
          <Plus size={14} /> 添加条款
        </button>
      </div>
      <div className="space-y-1.5">
        {terms.map((term, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <GripVertical size={14} className="text-slate-300 flex-shrink-0" />
            <span className="text-xs text-slate-400 w-5">{idx + 1}.</span>
            <input
              className="flex-1 border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-rose-400"
              value={term}
              onChange={(e) => update(idx, e.target.value)}
            />
            <button
              onClick={() => remove(idx)}
              className="p-1 text-slate-300 hover:text-red-500"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {terms.length === 0 && (
          <p className="text-xs text-slate-300 py-2">暂无条款</p>
        )}
      </div>
    </div>
  );
}
