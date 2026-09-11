#include <httplib.h>
#include <iostream>
#include "pose_adapter.h"
#include "filter_adapter.h"

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

    svr.Post("/node/execute", [](const httplib::Request& req, httplib::Response& res) {
        nlohmann::json body;
        try {
            body = nlohmann::json::parse(req.body);
        } catch (...) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid JSON\"}", "application/json");
            return;
        }
        std::string node_type = body.value("node_type", "");
        // filter_* node_type -> filter_adapter
        if (node_type.rfind("filter_", 0) == 0) {
            FilterRequest fr;
            if (!parseFilterRequest(body, fr)) {
                res.status = 400;
                res.set_content("{\"error\":\"invalid filter request shape\"}", "application/json");
                return;
            }
            try {
                FilterResponse resp = runFilter(fr);
                nlohmann::json out;
                out["output"] = serializeFilterResponse(resp);
                res.set_content(out.dump(), "application/json");
            } catch (const std::exception& e) {
                res.status = 500;
                res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
            }
            return;
        }
        if (node_type != "pose_generate" && node_type != "streaming_pose_generate") {
            res.status = 400;
            res.set_content("{\"error\":\"unknown node_type\"}", "application/json");
            return;
        }
        // Build a GenerateRequest-shaped JSON from the /node/execute frame,
        // then reuse the existing adapter. input.points -> points (pos only),
        // input pose fields ignored; params passed through.
        nlohmann::json genReq;
        genReq["node_type"] = node_type;
        genReq["points"] = body.value("input", nlohmann::json::object()).value("points", nlohmann::json::array());
        nlohmann::json params = body.value("params", nlohmann::json::object());
        genReq["initial_pose"] = params.value("initial_pose", nlohmann::json::object());
        genReq["initial_tangent"] = params.value("initial_tangent", nlohmann::json::object());
        nlohmann::json paramsWithoutInit = params;
        paramsWithoutInit.erase("initial_pose");
        paramsWithoutInit.erase("initial_tangent");
        genReq["params"] = paramsWithoutInit;

        GenerateRequest gr;
        if (!parseGenerateRequest(genReq, gr)) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid request shape\"}", "application/json");
            return;
        }
        if (gr.points.size() < 3) {
            GenerateResponse resp;
            resp.result = gr.points;
            nlohmann::json out;
            nlohmann::json arr = nlohmann::json::array();
            for (const auto& pt : resp.result) {
                cv::Point3f pos = pt.toPos();
                arr.push_back({{"x",pos.x},{"y",pos.y},{"z",pos.z},
                               {"rx",0.f},{"ry",0.f},{"rz",0.f}});
            }
            out["output"] = {{"points", arr}, {"meta", nlohmann::json::object()}};
            res.set_content(out.dump(), "application/json");
            return;
        }
        try {
            GenerateResponse resp = runGenerate(gr);
            nlohmann::json out;
            nlohmann::json arr = nlohmann::json::array();
            for (const auto& pt : resp.result) {
                cv::Point3f pos = pt.toPos();
                cv::Point3f rot = pt.toRot();
                arr.push_back({{"x",pos.x},{"y",pos.y},{"z",pos.z},
                               {"rx",rot.x},{"ry",rot.y},{"rz",rot.z}});
            }
            out["output"] = {{"points", arr}, {"meta", nlohmann::json::object()}};
            res.set_content(out.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
        }
    });

    // 节点链 <-> MWS_PathFilterAndPoseGenerator 序列化互导(直接用库 toJson/analysisJson)
    svr.Post("/pipeline/serialize", [](const httplib::Request& req, httplib::Response& res) {
        nlohmann::json body;
        try {
            body = nlohmann::json::parse(req.body);
            nlohmann::json out = runPipelineSerialize(body);
            res.set_content(out.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
        }
    });

    svr.Post("/pipeline/deserialize", [](const httplib::Request& req, httplib::Response& res) {
        nlohmann::json body;
        try {
            body = nlohmann::json::parse(req.body);
            nlohmann::json out = runPipelineDeserialize(body);
            res.set_content(out.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
        }
    });

    std::cout << "pose_backend listening on http://localhost:8220\n";
    svr.listen("0.0.0.0", 8220);
    return 0;
}
