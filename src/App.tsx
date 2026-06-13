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

interface ConversationInfo {
  id: string;
  title: string;
  createdAt: string;
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
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  
  const [chatMode, setChatMode] = useState<'AGENTS' | 'NORMAL'>('AGENTS');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  
  // Usamos useRef para mantener un sessionId persistente sin re-renders
  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(7));
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Conectar al servidor de producción
    socketRef.current = io('https://ser-150317434723.europe-west1.run.app');

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      addLog('Conectado a la Fábrica de Software IA.', true);
      socketRef.current?.emit('get_all_conversations');
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

    socketRef.current.on('agent_result', (data: any) => {
      addLog(`[RESULTADO FINAL]: ${data.result}`);
      setIsWorking(false);
      socketRef.current?.emit('get_all_conversations'); // Refrescar la barra lateral
    });

    socketRef.current.on('agent_error', (data: any) => {
      addLog(`[ERROR CRÍTICO]: ${data.error}`, true);
      setIsWorking(false);
      socketRef.current?.emit('get_all_conversations'); // Refrescar la barra lateral
    });

    socketRef.current.on('all_conversations', (data: { conversations: ConversationInfo[] }) => {
      setConversations(data.conversations || []);
    });

    socketRef.current.on('conversation_history', (data: { conversationId: string, history: any[] }) => {
      if (data.history && data.history.length > 0) {
        setLogs([]); // Limpiamos para no mezclar
        addLog(`=== Historial Cargado: ${data.conversationId} ===`, true);
        data.history.forEach((msg: any) => {
          if (msg.role === 'user') {
            addLog(`> ${msg.content}`, true);
          } else if (msg.role === 'assistant') {
            addLog(msg.content);
          }
        });
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
    
    if (chatMode === 'NORMAL') {
      addLog(`> ${input}`, true);
      socketRef.current.emit('run_chat', { 
        prompt: input,
        conversationId: sessionIdRef.current
      });
      setInput('');
      return;
    }

    if (isWorking) {
      // Inyección en caliente para destrabar al agente seleccionado o al planner
      const targetAgent = selectedAgent || 'Orquestador';
      const instruction = `[INSTRUCCIÓN HUMANA PARA ${targetAgent.toUpperCase()}]: ${input}`;
      addLog(`> ${instruction}`, true);
      socketRef.current.emit('human_intervention', { 
        conversationId: sessionIdRef.current, 
        message: instruction 
      });
    } else {
      // Nueva tarea desde cero o continuar sesión actual
      let finalPrompt = input;
      if (selectedAgent) {
        finalPrompt = `[DIRECTIVA ESTRICTA]: Ejecuta ÚNICAMENTE la siguiente tarea delegándola al agente ${selectedAgent.toUpperCase()} y luego finaliza inmediatamente el proceso sin llamar a nadie más. Tarea: "${input}"`;
        addLog(`> [Solicitud Directa a ${selectedAgent}]: ${input}`, true);
      } else {
        addLog(`> ${input}`, true);
      }

      socketRef.current.emit('run_orchestrator', { 
        prompt: finalPrompt,
        conversationId: sessionIdRef.current
      });
      setIsWorking(true);
      setAgents(INITIAL_AGENTS);
      setSelectedAgent(null);
    }
    
    setInput('');
  };

  const startNewChat = () => {
    sessionIdRef.current = Math.random().toString(36).substring(7);
    setLogs([]);
    setAgents(INITIAL_AGENTS);
    addLog('--- Nueva Sesión Iniciada ---', true);
  };

  const loadConversation = (id: string) => {
    sessionIdRef.current = id;
    socketRef.current?.emit('get_conversation_history', { conversationId: id });
    if (window.innerWidth < 768) setSidebarOpen(false); // Cierra sidebar en móvil
  };

  return (
    <div className="app-layout">
      {/* Sidebar (ChatGPT style) */}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h2>KODU History</h2>
          <button className="new-chat-btn" onClick={startNewChat}>
            + New Chat
          </button>
        </div>
        <div className="conversations-list">
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={`conv-item ${sessionIdRef.current === conv.id ? 'active' : ''}`}
              onClick={() => loadConversation(conv.id)}
            >
              <div className="conv-title">{conv.title}</div>
              <div className="conv-date">{new Date(conv.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
          {conversations.length === 0 && <div className="no-convs">No hay chats previos.</div>}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="top-bar">
          <div className="logo">
            <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <span className="terminal-icon"><Terminal size={24} /></span>
            <div>
              <h1>KODU Code</h1>
              <p>Sitios web y apps AI Factory</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="mode-toggle" style={{ display: 'flex', background: '#222', borderRadius: '4px', overflow: 'hidden' }}>
              <button 
                onClick={() => setChatMode('AGENTS')}
                style={{ padding: '6px 12px', background: chatMode === 'AGENTS' ? 'var(--neon-green)' : 'transparent', color: chatMode === 'AGENTS' ? '#000' : '#888', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                🤖 AGENTES
              </button>
              <button 
                onClick={() => setChatMode('NORMAL')}
                style={{ padding: '6px 12px', background: chatMode === 'NORMAL' ? 'var(--neon-green)' : 'transparent', color: chatMode === 'NORMAL' ? '#000' : '#888', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                💬 CHAT NORMAL
              </button>
            </div>
            <div className="status-badge" style={{ borderColor: isWorking && chatMode === 'AGENTS' ? 'var(--neon-green)' : '#555', color: isWorking && chatMode === 'AGENTS' ? 'var(--neon-green)' : '#555' }}>
              <div className="status-dot" style={{ backgroundColor: isWorking && chatMode === 'AGENTS' ? 'var(--neon-green)' : '#555', boxShadow: isWorking && chatMode === 'AGENTS' ? '0 0 8px var(--neon-green)' : 'none', animation: isWorking && chatMode === 'AGENTS' ? 'pulse 1.5s infinite alternate' : 'none' }}></div>
              {isWorking && chatMode === 'AGENTS' ? 'WORKING' : (isConnected ? 'IDLE' : 'OFFLINE')}
            </div>
          </div>
        </div>

        {chatMode === 'AGENTS' && (
          <div className="agents-panel">
            {agents.map(agent => (
              <div 
                key={agent.name} 
                className={`agent-card ${agent.status.toLowerCase()} ${selectedAgent === agent.name ? 'selected' : ''}`}
                onClick={() => setSelectedAgent(agent.name === selectedAgent ? null : agent.name)}
                style={{ cursor: 'pointer' }}
              >
                <div className="agent-header">
                  <span className="agent-icon">{agent.icon}</span>
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-status-label">{agent.status}</span>
                </div>
                <div className="agent-message">{agent.lastMessage || 'Inactivo'}</div>
              </div>
            ))}
          </div>
        )}

        <div className="logs-container">
          {logs.map((log, i) => {
            const contentStr = typeof log.content === 'string' ? log.content : (log.content ? JSON.stringify(log.content) : '');
            const hasZip = contentStr.includes('[ZIP_READY]');
            let textPart = contentStr;
            let zipPath = '';
            
            if (hasZip) {
              const parts = contentStr.split('[ZIP_READY]');
              textPart = parts[0];
              // Toma solo la ruta (hasta el primer espacio, salto de línea o backtick)
              zipPath = parts[1].trim().split(/[\s\n`]/)[0];
            }

            return (
              <div key={i} className="log-entry">
                <span className="log-time">[{log.time}]</span>
                <span className={`log-content ${log.isSystem ? 'system' : ''}`}>
                  {textPart}
                  {hasZip && (
                    <div style={{ marginTop: '8px' }}>
                      <a 
                        href={`https://ser-150317434723.europe-west1.run.app/orchestrator/download?path=${encodeURIComponent(zipPath)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--neon-green)', textDecoration: 'underline', fontWeight: 'bold' }}
                      >
                        📦 Descargar código fuente (.zip)
                      </a>
                    </div>
                  )}
                </span>
              </div>
            );
          })}
          <div ref={logsEndRef} />
        </div>

        <div className="input-container">
          <input 
            type="text" 
            className="prompt-input"
            placeholder={isWorking 
              ? (selectedAgent ? `Intervenir y destrabar al ${selectedAgent}...` : "Dar directiva extra al Orquestador...")
              : "Describe la app que quieres crear..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={!isConnected}
          />
          <button 
            className="send-btn"
            onClick={handleSend}
            disabled={!isConnected}
            style={isWorking ? { borderColor: '#ff0041', color: '#ff0041', textShadow: '0 0 5px #ff0041' } : {}}
          >
            {isWorking ? 'INTERVENIR' : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
