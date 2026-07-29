#include <httplib.h>
#include <iostream>
#include "pose_adapter.h"

int main() {
    httplib::Server svr;

    svr.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\"}", "application/json");
    });

    svr.Post("/generate", [](const httplib::Request& req, httplib::Response& res) {
        nlohmann::json body;
        try {
            body = nlohmann::json::parse(req.body);
        } catch (...) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid JSON\"}", "application/json");
            return;
        }
        GenerateRequest gr;
        if (!parseGenerateRequest(body, gr)) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid request shape\"}", "application/json");
            return;
        }
        if (gr.points.size() < 3) {
            // Library returns input unchanged for <3 points; mirror that.
            GenerateResponse resp;
            resp.result = gr.points;
            res.set_content(serializeGenerateResponse(resp).dump(), "application/json");
            return;
        }
        try {
            GenerateResponse resp = runGenerate(gr);
            res.set_content(serializeGenerateResponse(resp).dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
        }
    });

    std::cout << "pose_backend listening on http://localhost:8220\n";
    svr.listen("0.0.0.0", 8220);
    return 0;
}
