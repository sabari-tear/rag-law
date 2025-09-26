from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import requests
import logging
import time
from datetime import datetime
from typing import Dict, Any
from werkzeug.exceptions import BadRequest

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# --- CONFIGURATION ---
RAG_API_URL = "http://127.0.0.1:8003"  # FastAPI RAG backend URL
REQUEST_TIMEOUT = 30

class LegalRAGProxy:
    """Proxy to FastAPI RAG backend"""
    
    def __init__(self):
        self.conversation_history = []
        self.rag_api_url = RAG_API_URL
        logger.info(f"🔗 Connecting to RAG API at {self.rag_api_url}")
    
    def check_backend_health(self) -> bool:
        """Check if FastAPI backend is running"""
        try:
            response = requests.get(f"{self.rag_api_url}/docs", timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def process_legal_query(self, query: str) -> Dict[str, Any]:
        """Send query to FastAPI RAG backend and return response"""
        if not query.strip():
            return {
                "error": "Query cannot be empty",
                "success": False
            }
        
        try:
            start_time = time.time()
            
            # Send request to FastAPI backend
            response = requests.post(
                f"{self.rag_api_url}/api/query",
                json={"question": query},
                timeout=REQUEST_TIMEOUT
            )
            
            processing_time = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                
                # Store conversation
                conversation_entry = {
                    "query": query,
                    "response": data.get("answer", ""),
                    "timestamp": datetime.now().isoformat(),
                    "processing_time": processing_time,
                    "success": True
                }
                self.conversation_history.append(conversation_entry)
                
                # Extract legal sections and citations from response
                answer_text = data.get("answer", "")
                legal_sections = self._extract_legal_sections(answer_text)
                citations = self._extract_citations(answer_text)
                
                return {
                    "success": True,
                    "query": query,
                    "response": answer_text,
                    "legal_sections": legal_sections,
                    "citations": citations,
                    "processing_time": processing_time,
                    "timestamp": conversation_entry["timestamp"],
                    "intent": self._classify_intent(query),
                    "confidence_score": self._calculate_confidence(answer_text)
                }
            else:
                error_msg = f"RAG API error: {response.status_code}"
                logger.error(error_msg)
                return {
                    "error": error_msg,
                    "success": False
                }
                
        except requests.exceptions.Timeout:
            return {
                "error": "Request timeout - RAG backend took too long to respond",
                "success": False
            }
        except requests.exceptions.ConnectionError:
            return {
                "error": "Cannot connect to RAG backend. Please ensure it's running on port 8003",
                "success": False
            }
        except Exception as e:
            logger.error(f"Error processing query: {e}")
            return {
                "error": f"An error occurred while processing your query: {str(e)}",
                "success": False
            }
    
    def _extract_legal_sections(self, text: str) -> list:
        """Extract legal section references from response text"""
        import re
        sections = []
        
        # Look for patterns like "Section 123", "Article 45", etc.
        patterns = [
            r'Section (\d+[A-Z]?)',
            r'Article (\d+[A-Z]?)', 
            r'Chapter (\d+)',
            r'Part ([IVX]+)',
            r'Rule (\d+)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                sections.append(f"{pattern.split('(')[0].strip()} {match}")
        
        return list(set(sections))  # Remove duplicates
    
    def _extract_citations(self, text: str) -> list:
        """Extract source citations from response text"""
        citations = []
        if "Source:" in text:
            # Simple extraction - in real implementation, this would be more sophisticated
            citations.append("Legal Documents Database")
        return citations
    
    def _classify_intent(self, query: str) -> str:
        """Simple intent classification based on query keywords"""
        query_lower = query.lower()
        
        if any(word in query_lower for word in ['criminal', 'crime', 'punishment', 'arrest', 'police']):
            return 'criminal_law'
        elif any(word in query_lower for word in ['civil', 'property', 'contract', 'dispute']):
            return 'civil_law'
        elif any(word in query_lower for word in ['constitution', 'fundamental', 'rights']):
            return 'constitutional_law'
        elif any(word in query_lower for word in ['procedure', 'court', 'filing']):
            return 'procedural_law'
        elif any(word in query_lower for word in ['family', 'marriage', 'divorce']):
            return 'family_law'
        else:
            return 'general_legal'
    
    def _calculate_confidence(self, response: str) -> float:
        """Calculate confidence score based on response characteristics"""
        if not response:
            return 0.0
        
        # Simple confidence calculation based on response length and content
        base_confidence = 0.7
        
        if len(response) > 100:
            base_confidence += 0.1
        if "Section" in response or "Article" in response:
            base_confidence += 0.1
        if len(response) > 500:
            base_confidence += 0.1
            
        return min(base_confidence, 1.0)
    
    def get_conversation_history(self) -> list:
        """Get conversation history"""
        return self.conversation_history[-10:]  # Return last 10 conversations
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get system status"""
        backend_healthy = self.check_backend_health()
        
        return {
            "backend_connected": backend_healthy,
            "total_conversations": len(self.conversation_history),
            "rag_api_url": self.rag_api_url,
            "status": "online" if backend_healthy else "backend_offline"
        }

# Initialize the RAG proxy
legal_rag = LegalRAGProxy()

# --- API ROUTES ---

@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    """Main chat endpoint - proxy to FastAPI RAG backend"""
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({
                "error": "Missing 'query' field in request",
                "success": False
            }), 400
        
        query = data['query'].strip()
        
        if not query:
            return jsonify({
                "error": "Query cannot be empty",
                "success": False
            }), 400
        
        # Process the query through RAG backend
        result = legal_rag.process_legal_query(query)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        return jsonify({
            "error": "Internal server error",
            "success": False
        }), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get conversation history"""
    try:
        history = legal_rag.get_conversation_history()
        return jsonify({
            "success": True,
            "history": history
        })
    except Exception as e:
        logger.error(f"History endpoint error: {e}")
        return jsonify({
            "error": "Failed to retrieve history",
            "success": False
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Legal RAG Frontend",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    })

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get detailed system status"""
    try:
        status = legal_rag.get_system_status()
        return jsonify({
            "success": True,
            "status": status
        })
    except Exception as e:
        logger.error(f"Status endpoint error: {e}")
        return jsonify({
            "error": "Failed to get status",
            "success": False
        }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    print("🚀 Legal RAG Frontend Server")
    print("="*50)
    print(f"📱 Web Interface: http://localhost:5000")
    print(f"🔗 RAG Backend: {RAG_API_URL}")
    print("="*50)
    print("⚠️  Make sure to start the RAG backend first:")
    print("   python rag.py")
    print("="*50)
    
    app.run(host="0.0.0.0", port=5000, debug=True)