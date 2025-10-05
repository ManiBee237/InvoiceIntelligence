import React, { useState } from "react";
import { ml } from "../lib/api";

export default function MLPlayground() {
  const [text, setText] = useState("12 pcs A4 photocopy paper");
  const [category, setCategory] = useState("");
  const [prob, setProb] = useState(null);

  const run = async () => {
    try {
      const { data } = await ml.post("/categorize", { description: text });
      setCategory(data.top_label);
      setProb(data.top_prob);
    } catch (e) {
      setCategory("");
      setProb(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">ML Playground</h1>
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border px-3 py-2"
          placeholder="Item description"
        />
        <button
          onClick={run}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white"
        >
          Categorize
        </button>
        {category && (
          <div className="text-sm">
            Predicted: <b>{category}</b>{" "}
            {prob !== null && `(p=${prob.toFixed(2)})`}
          </div>
        )}
      </div>
    </div>
  );
}
