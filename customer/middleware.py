class SecurityHeaders:
    def __init__(self, get_response): self.get_response = get_response
    def __call__(self, request):
        response = self.get_response(request)
        response['Cache-Control'] = 'no-store, max-age=0'
        response['X-Frame-Options'] = 'DENY'
        response['Referrer-Policy'] = 'no-referrer'
        response['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        return response
