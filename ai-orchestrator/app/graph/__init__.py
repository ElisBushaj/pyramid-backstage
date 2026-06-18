"""The deterministic planning graph (Alvin's lane).

Re-exports the graph builder + state type. The GRAPH WIRING is complete and
correct (it encodes the deterministic-DAG requirement from
``docs/02-domain/AI_ORCHESTRATION.md`` non-negotiable #1); only the node BODIES
are stubs awaiting implementation (see ``docs/06-features/A00-ai-orchestrator``).
"""

from .planning_graph import PlanState, build_planning_graph

__all__ = ["PlanState", "build_planning_graph"]
