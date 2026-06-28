def test_app_schema_exposes_status_and_settings():
    from api.main import app

    schema = app.openapi()

    assert schema["info"]["version"]
    assert "/api/v1/status" in schema["paths"]
    assert "/api/v1/settings" in schema["paths"]
