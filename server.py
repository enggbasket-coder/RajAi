import http.server
import socketserver
import urllib.parse
import json
import os
import re

PORT = 8000

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/ask'):
            referer = self.headers.get('Referer')
            if not referer or not (referer.startswith('http://localhost:8000/') or referer.startswith('http://127.0.0.1:8000/')):
                self.send_response(403)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Forbidden'}).encode())
                return

            query_components = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            question = query_components.get("q", [None])[0]

            if question:
                try:
                    with open('public/document.txt', 'r') as f:
                        document_text = f.read()

                    # Improved sentence splitting using regex
                    sentences = re.split(r'(?<=[.!?]) +', document_text.replace('\n', ' '))

                    # Tokenize question and remove stop words
                    stop_words = set(["a", "an", "the", "is", "in", "it", "of", "for", "what", "who", "when", "where", "why", "how"])
                    question_words = set(question.lower().split()) - stop_words

                    best_sentence = "I'm sorry, I don't have an answer to that."
                    max_score = 0

                    for sentence in sentences:
                        sentence_words = set(sentence.lower().split())
                        score = len(question_words.intersection(sentence_words))

                        if score > max_score:
                            max_score = score
                            best_sentence = sentence.strip()

                    answer = best_sentence

                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'answer': answer}).encode())
                except FileNotFoundError:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'Document not found.'}).encode())
            else:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing question.'}).encode())
        else:
            # This is a bit of a hack to serve files from the 'public' directory
            # without changing the current working directory of the server process.
            # It's not recommended for production use, but it's simple and works for this example.
            try:
                # Security check to prevent directory traversal
                if '..' in self.path:
                    self.send_error(403)
                    return

                # If the path is a directory, serve index.html
                if self.path == '/':
                    filepath = 'public/index.html'
                else:
                    filepath = 'public' + self.path

                with open(filepath, 'rb') as f:
                    self.send_response(200)
                    if filepath.endswith(".html"):
                        self.send_header('Content-type', 'text/html')
                    elif filepath.endswith(".css"):
                        self.send_header('Content-type', 'text/css')
                    elif filepath.endswith(".js"):
                        self.send_header('Content-type', 'application/javascript')
                    else:
                        self.send_header('Content-type', 'text/plain')
                    self.end_headers()
                    self.wfile.write(f.read())
            except FileNotFoundError:
                self.send_error(404, 'File Not Found: %s' % self.path)


with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print("serving at port", PORT)
    httpd.serve_forever()
