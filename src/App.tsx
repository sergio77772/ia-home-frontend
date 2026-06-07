import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Terminal, Send } from 'lucide-react';
import './index.css';

interface LogMessage {
  time: string;
  content: string;
  isSystem?: boolean;
}

interface AgentState {
  name: string;
  icon: string;
  status: 'IDLE' | 'WORKING' | 'DONE';
  lastMessage: string;
}

const INITIAL_AGENTS: AgentState[] = [
  { name: 'Architect', icon: '🏛️', status: 'IDLE', lastMessage: '' },
  { name: 'Coder', icon: '💻', status: 'IDLE', lastMessage: '' },
  { name: 'Reviewer', icon: '🔍', status: 'IDLE', lastMessage: '' },
  { name: 'Tester', icon: '🧪', status: 'IDLE', lastMessage: '' },
  { name: 'DevOps', icon: '🐙', status: 'IDLE', lastMessage: '' }
];

function App() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Conectar al servidor de producción
    socketRef.current = io('https://ser-150317434723.europe-west1.run.app');

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      addLog('Sistema conectado a la Fábrica de Software.', true);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      setIsWorking(false);
      setAgents(INITIAL_AGENTS);
      addLog('Conexión perdida. Intentando reconectar...', true);
    });

    // Escuchar logs de los agentes
    socketRef.current.on('agent_log', (data: any) => {
      // El backend envía { message, meta, timestamp }
      const logStr = typeof data === 'string' ? data : (data.message || '');
      addLog(logStr);

      // Actualizar estado de agentes basado en el log
      setAgents(prevAgents => {
        const newAgents = [...prevAgents];
        
        // Si el planner delegó, marcamos al agente como WORKING
        const delegateMatch = logStr.match(/\[Planner\] 🧠 -> 🤖 Delegando a (\w+)/i);
        if (delegateMatch) {
          const name = delegateMatch[1];
          const agent = newAgents.find(a => a.name.toLowerCase() === name.toLowerCase());
          if (agent) {
            agent.status = 'WORKING';
            agent.lastMessage = 'Esperando directivas...';
          }
        }

        // Si el planner dice que finalizó, marcamos como DONE
        const finishedMatch = logStr.match(/\[Planner\] 🤖 -> 🧠 (\w+) finalizó/i);
        if (finishedMatch) {
          const name = finishedMatch[1];
          const agent = newAgents.find(a => a.name.toLowerCase() === name.toLowerCase());
          if (agent) {
            agent.status = 'DONE';
            agent.lastMessage = 'Tarea completada.';
          }
        }

        // Si un agente habla directamente, actualizamos su mensaje y estado
        const talkMatch = logStr.match(/\[(\w+)\] (.+)/);
        if (talkMatch) {
          const name = talkMatch[1];
          const msg = talkMatch[2];
          if (name !== 'Planner') {
            const agent = newAgents.find(a => a.name.toLowerCase() === name.toLowerCase());
            if (agent) {
              agent.status = 'WORKING';
              agent.lastMessage = msg;
            }
          }
        }

        return newAgents;
      });

      // Heurística simple para saber si terminaron
      if (logStr.includes('CODER_COMPLETADO') || logStr.includes('DEVOPS_COMPLETADO') || logStr.includes('REVISION_APROBADA')) {
        setIsWorking(false);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    // Auto-scroll hacia abajo
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (content: string, isSystem: boolean = false) => {
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [...prev, { time, content, isSystem }]);
  };

  const handleSend = () => {
    if (!input.trim() || !socketRef.current) return;
    
    addLog(`> ${input}`, true);
    socketRef.current.emit('run_orchestrator', { prompt: input });
    setIsWorking(true);
    setAgents(INITIAL_AGENTS);
    setInput('');
  };

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="header-title">
          <Terminal size={32} color="var(--neon-green)" />
          <div className="title-text">
            <span className="title-main">KODU Code</span>
            <span className="title-sub">Sitios web y apps AI Factory</span>
          </div>
        </div>
        <div className="status-badge" style={{ borderColor: isWorking ? 'var(--neon-green)' : '#555', color: isWorking ? 'var(--neon-green)' : '#555' }}>
          <div className="status-dot" style={{ backgroundColor: isWorking ? 'var(--neon-green)' : '#555', boxShadow: isWorking ? '0 0 8px var(--neon-green)' : 'none', animation: isWorking ? 'pulse 1.5s infinite alternate' : 'none' }}></div>
          {isWorking ? 'WORKING' : (isConnected ? 'IDLE' : 'OFFLINE')}
        </div>
      </div>

      <div className="agents-panel">
        {agents.map(agent => (
          <div key={agent.name} className={`agent-card ${agent.status.toLowerCase()}`}>
            <div className="agent-header">
              <span className="agent-icon">{agent.icon}</span>
              <span className="agent-name">{agent.name}</span>
              <span className="agent-status-label">{agent.status}</span>
            </div>
            <div className="agent-message">{agent.lastMessage || 'Inactivo'}</div>
          </div>
        ))}
      </div>

      <div className="logs-container">
        {logs.map((log, i) => (
          <div key={i} className="log-entry">
            <span className="log-time">[{log.time}]</span>
            <span className={`log-content ${log.isSystem ? 'system' : ''}`}>
              {log.content}
            </span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <div className="input-container">
        <input 
          type="text" 
          className="prompt-input"
          placeholder="Describe la app que quieres crear..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={!isConnected || isWorking}
        />
        <button 
          className="send-btn"
          onClick={handleSend}
          disabled={!isConnected || isWorking}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}

export default App;
