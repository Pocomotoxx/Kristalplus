import { ColonyHub } from './colony-hub.js';
import { BUILTIN_AGENT_PROFILES } from './agents/agent-profiles.js';
import { ReasoningPattern } from './neural/reasoning-bank.js';

async function main() {
  console.log('🧠 Testing Kristal Neural Adaptive Routing & Reasoning Bank...');

  const colony = new ColonyHub({ name: 'Kristal-Neural-Prime' });

  // 1. Register agents for all roles
  for (const profile of Object.values(BUILTIN_AGENT_PROFILES)) {
    colony.registry.register({
      name: `${profile.name}-Instance`,
      role: profile.role,
      capabilities: {
        tools: profile.capabilities,
        maxConcurrentTasks: profile.maxConcurrentTasks,
      },
    });
  }

  console.log(`✅ Registered ${colony.registry.getAllMembers().length} specialist members.`);

  // 2. Adaptive Routing Test: Task without explicit role
  console.log('\n🧭 Submitting task with Neural MoE Router...');
  const securityTaskInput = {
    title: 'Sanitize user inputs and patch potential SQL injection',
    description: 'Perform a comprehensive vulnerability audit on authorization token handlers and escape queries.',
  };

  const { task: securityTask, routeDecision } = await colony.submitAdaptiveTask(securityTaskInput);

  console.log(`🎯 MoE Router Decision:`);
  console.log(`  - Target Role: ${routeDecision?.targetRole}`);
  console.log(`  - Confidence: ${((routeDecision?.confidence || 0) * 100).toFixed(1)}%`);
  console.log(`  - Reasoning: ${routeDecision?.reasoning}`);
  console.log(`  - Assigned Agent: ${securityTask.assignedAgentId}`);

  // 3. Complete task -> triggers automatic Reasoning Bank learning loop
  console.log('\n✨ Completing security task with verified fix...');
  await colony.orchestrator.completeTask(securityTask.id, securityTask.assignedAgentId!, {
    patch: 'Applied parameterized queries and sanitized JWT signature verification.',
    status: 'fixed',
  });

  // Small delay for event loop processing
  await new Promise((r) => setTimeout(r, 100));

  console.log(`📚 Reasoning Bank Pattern Count: ${await colony.reasoningBank.count()}`);

  // 4. Recall learned pattern for a similar future problem
  console.log('\n🔍 Recalling learned knowledge for future query: "How to prevent SQL injection in tokens?"');
  const recalledPatterns: ReasoningPattern[] = await colony.reasoningBank.recallPatterns('Prevent SQL injection in tokens', { topK: 2 });
  
  recalledPatterns.forEach((p: ReasoningPattern, idx: number) => {
    console.log(`  [Pattern ${idx + 1}] Role: [${p.role}] | Score: ${(p.successScore * 100).toFixed(0)}%`);
    console.log(`    Problem: ${p.problem}`);
    console.log(`    Solution: ${p.solution}`);
  });

  console.log('\n📊 Final Colony Snapshot:');
  console.log(JSON.stringify(colony.getSnapshot(), null, 2));
}

main().catch(console.error);
