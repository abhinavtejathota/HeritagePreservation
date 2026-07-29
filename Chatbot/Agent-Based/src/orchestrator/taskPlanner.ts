import { AgentTask } from "./task.types";

export const AGENT_PRIORITY: Record<string, number> = {
  monument: 5,
  geo: 1,
  civilization: 2,
  architecture: 3,
  timeline: 4
};

export function planTasks(intents: string[]): AgentTask[] {
  const tasks: AgentTask[] = [];

  for (const intent of intents) {
    if (AGENT_PRIORITY[intent]) {
      tasks.push({
        agent: intent,
        priority: AGENT_PRIORITY[intent]!
      });
    }
  }
  
  //Ensure monument agent always runs first (context safety) 
  if (!tasks.some(t => t.agent === "monument")) { 
    tasks.push({ 
	  agent: "monument", 
	  priority: AGENT_PRIORITY.monument! 
	});
  }

  return tasks.sort((a, b) => a.priority - b.priority);
}
