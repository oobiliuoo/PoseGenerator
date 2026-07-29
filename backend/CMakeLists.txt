cmake_minimum_required(VERSION 3.16)
project(PoseBackend LANGUAGES CXX)

# --- NEXUS roots -----------------------------------------------------------
if(DEFINED ENV{NEXUS_ROOT})
    set(NEXUS_ROOT "$ENV{NEXUS_ROOT}")
else()
    set(NEXUS_ROOT "E:/workspace/nexus")
endif()

if(DEFINED ENV{NEXUS_ENV_ROOT})
    set(NEXUS_ENV_ROOT "$ENV{NEXUS_ENV_ROOT}")
else()
    set(NEXUS_ENV_ROOT "${NEXUS_ROOT}/../env")
endif()
string(REPLACE "\\" "/" NEXUS_ROOT "${NEXUS_ROOT}")
string(REPLACE "\\" "/" NEXUS_ENV_ROOT "${NEXUS_ENV_ROOT}")

# --- ABI must match nexus: MSVC, C++17, /MD, x64, RelWithDebInfo ----------
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(MSVC)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
    add_compile_options(/utf-8 /FS /MP /bigobj /wd4819 /wd4828 /wd4114 /wd4005 /wd4091 /wd5208)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
endif()
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "" FORCE)
endif()

# --- Backend exe outputs into nexus runtime dir to reuse DLL chain ---------
set(NEXUS_RUNTIME_DIR "${NEXUS_ROOT}/x64/Release")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${NEXUS_RUNTIME_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO ${NEXUS_RUNTIME_DIR})

add_executable(pose_backend
    src/main.cpp
    src/pose_adapter.cpp
)
target_include_directories(pose_backend PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
    ${NEXUS_ROOT}/MultimodalWeldSystem/include
    ${NEXUS_ROOT}/Toolkit/include
    ${NEXUS_ROOT}/Nexus/include
    ${NEXUS_ROOT}/pos_transform/include
    ${NEXUS_ROOT}/RoboLinker/include
    ${NEXUS_ENV_ROOT}/Eigen3.4
    ${NEXUS_ENV_ROOT}/opencv-4.10.0/build/include
    ${NEXUS_ENV_ROOT}/spdlog/include
    ${NEXUS_ENV_ROOT}/tj_ipcsys_lib
    ${NEXUS_ENV_ROOT}/libmodbus/include
)
target_link_libraries(pose_backend PRIVATE
    ${NEXUS_ROOT}/x64/Release/MultimodalWeldSystem.lib
    ${NEXUS_ROOT}/x64/Release/Toolkit.lib
    ${NEXUS_ROOT}/x64/Release/Nexus.lib
    ${NEXUS_ROOT}/x64/Release/pos_transform.lib
    ${NEXUS_ROOT}/x64/Release/RoboLinker.lib
    ${NEXUS_ENV_ROOT}/opencv-4.10.0/build/x64/vc16/lib/opencv_world4100.lib
    ${NEXUS_ENV_ROOT}/spdlog/lib/spdlog.lib
)
target_compile_definitions(pose_backend PRIVATE NOMINMAX)

add_executable(test_adapter src/tests/test_adapter.cpp src/pose_adapter.cpp)
target_include_directories(test_adapter PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
    ${NEXUS_ROOT}/MultimodalWeldSystem/include
    ${NEXUS_ROOT}/Toolkit/include
    ${NEXUS_ROOT}/Nexus/include
    ${NEXUS_ROOT}/pos_transform/include
    ${NEXUS_ROOT}/RoboLinker/include
    ${NEXUS_ENV_ROOT}/Eigen3.4
    ${NEXUS_ENV_ROOT}/opencv-4.10.0/build/include
    ${NEXUS_ENV_ROOT}/spdlog/include
    ${NEXUS_ENV_ROOT}/tj_ipcsys_lib
    ${NEXUS_ENV_ROOT}/libmodbus/include
)
target_link_libraries(test_adapter PRIVATE
    ${NEXUS_ROOT}/x64/Release/MultimodalWeldSystem.lib
    ${NEXUS_ROOT}/x64/Release/Toolkit.lib
    ${NEXUS_ROOT}/x64/Release/Nexus.lib
    ${NEXUS_ROOT}/x64/Release/pos_transform.lib
    ${NEXUS_ROOT}/x64/Release/RoboLinker.lib
    ${NEXUS_ENV_ROOT}/opencv-4.10.0/build/x64/vc16/lib/opencv_world4100.lib
    ${NEXUS_ENV_ROOT}/spdlog/lib/spdlog.lib
)
target_compile_definitions(test_adapter PRIVATE NOMINMAX)
set_target_properties(test_adapter PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
